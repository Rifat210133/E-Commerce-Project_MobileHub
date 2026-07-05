"""Payment integration endpoints.

Three endpoints per provider (bKash, Nagad):

* ``POST .../create/``  body ``{draft_id}`` (new flow) OR
                         ``{order_number}`` (legacy) →
                         ``{payment_id, redirect_url}``
* ``POST .../execute/`` body ``{payment_id}``  → ``{status, payment_id, order}``
* ``GET  .../return/``  query ``?paymentID=…&order=…`` → 302 to order page

Why we don't combine create+execute:
bKash / Nagad require the user to interact with a hosted page (the
``bkashURL`` / ``callBackUrl``) before the payment is finalized. The
FE opens that URL in a new tab, the user confirms, then the FE polls
``execute`` until the status flips to ``Paid`` — at which point the
order is marked paid.

The ``create`` endpoint is the idempotency boundary: re-posting with
the same ``draft_id`` (or ``order_number`` for legacy callers) returns
the existing attempt's ``payment_id`` so the FE doesn't have to worry
about double-clicks.

New deferred-Order flow:
Since `apps/orders/views.py:checkout` no longer fabricates an Order
for online methods, the ``create`` endpoint usually receives a
``draft_id`` rather than an ``order_number``. The associated
``PaymentAttempt`` snapshots the cart + address and exposes a
provider-shaped stub via ``PaymentAttempt.as_provider_stub()`` so the
provider's ``create()`` keeps working untouched. ``order_number`` is
kept supported so any in-flight sessions on the previous contract don't
break; they fall through to the legacy path (which locates an Order
and either reuses its existing attempt or creates a fresh one).
"""
from __future__ import annotations

import random
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.orders.models import Cart, Order

from .bkash import BkashSandboxProvider
from .http import ProviderHTTPError
from .models import PaymentAttempt
from .nagad import NagadSandboxProvider


_PROVIDERS = {
    "bkash": BkashSandboxProvider,
    "nagad": NagadSandboxProvider,
}


def _provider(code: str):
    """Return a fresh provider instance or raise ``Http404`` if unknown."""
    cls = _PROVIDERS.get(code)
    if cls is None:
        raise Http404(f"Unknown payment provider {code!r}")
    return cls()


def _generate_order_number() -> str:
    """Return a unique ``MH-#####`` order number (mirror of orders.views)."""
    while True:
        number = f"MH-{random.randint(10000, 99999)}"
        if not Order.objects.filter(order_number=number).exists():
            return number


def _materialize_order_from_attempt(attempt: PaymentAttempt) -> Order:
    """Materialise an Order from the PaymentAttempt's snapshot.

    Called from ``payment_execute`` / ``payment_return`` once the gateway
    confirms a payment on an attempt that has ``order=NULL`` (the new
    deferred-Order flow). On success, the attempt is linked to the
    freshly-created Order, stock is decremented, the cart is cleared,
    and paid_at / paid_via are stamped.

    Idempotent: if ``attempt.has_order`` already, the existing Order is
    returned and nothing is re-created. Safe under concurrent polling —
    the entire block runs inside ``SELECT ... FOR UPDATE`` on the
    attempt row.
    """
    if attempt.has_order:
        return attempt.order

    user = attempt.user
    shipping_address = dict(attempt.shipping_address or {})
    payment_method = attempt.payment_method or shipping_address.get("payment_method") or attempt.provider

    with transaction.atomic():
        # Re-lock the attempt row to defeat concurrent materialise calls
        # (the FE polls /execute every few seconds while we serve
        # webhooks / browser-return in parallel).
        locked = PaymentAttempt.objects.select_for_update().get(pk=attempt.pk)
        if locked.has_order:
            return locked.order

        order = Order.objects.create(
            order_number=_generate_order_number(),
            user=user,
            items=list(attempt.items or []),
            total_amount=attempt.amount,
            shipping_address={**shipping_address, "payment_method": payment_method},
            estimated_arrival=(timezone.now().date() + timedelta(days=5)),
            status="Confirmed",
            status_notes=f"Payment received via {attempt.provider.title()}.",
            paid_at=timezone.now(),
            paid_via=attempt.provider,
        )

        # Decrement stock for every line that was snapshotted on the
        # attempt. We re-resolve by product_id (the snapshot is just a
        # dict) so the decrement reflects exactly what was sold.
        for line in order.items:
            try:
                qty = int(line.get("quantity", 0))
            except (TypeError, ValueError):
                qty = 0
            if qty <= 0:
                continue
            from apps.products.models import Product

            product = Product.objects.filter(pk=line.get("product_id")).first()
            if product is None:
                continue
            product.stock = max(product.stock - qty, 0)
            product.save(update_fields=["stock"])

        # Clear the customer's cart — every line item on the new order
        # was sourced from it. We swallow the empty-cart case rather
        # than crash on a logged-out / cart-already-cleared edge case.
        cart = Cart.objects.filter(user=user).first()
        if cart is not None:
            cart.items.all().delete()

        locked.order = order
        locked.save(update_fields=["order", "updated_at"])

    return order


# ---------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payment_create(request, provider: str):
    """Issue a payment session with the provider for an unpaid order.

    Idempotent on the input: a second call with the same ``draft_id``
    (new flow) or ``order_number`` (legacy) returns the existing
    attempt's ``payment_id`` so the FE doesn't have to worry about
    double-clicks.

    Body options:
      * ``{"draft_id": 17, "draft_number": "MH-D12345"}`` — new flow,
        posted by ``apps.orders.views.checkout`` after it has snapshotted
        the cart + address onto a ``PaymentAttempt`` with ``order=NULL``.
      * ``{"order_number": "MH-12345"}`` — legacy flow for any session
        that pre-dates the deferred-Order refactor.
    """
    if provider not in settings.FEATURE_PAYMENT_METHODS:
        return Response(
            {"detail": f"{provider.title()} is currently disabled."},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    draft_id = request.data.get("draft_id")
    order_number = request.data.get("order_number") or request.data.get("order")

    if not draft_id and not order_number:
        return Response(
            {"detail": "draft_id or order_number is required."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    prov = _provider(provider)

    # ------------------------------------------------------------------
    # New deferred-Order path: the attempt was already created by
    # ``checkout()`` with the cart + address snapshot and ``order=NULL``.
    # Reuse it (idempotency) — the provider interaction is identical to
    # the legacy path, just with a stub order object.
    # ------------------------------------------------------------------
    if draft_id:
        attempt = get_object_or_404(
            PaymentAttempt, pk=draft_id, provider=provider, user=request.user
        )
        if attempt.is_terminal:
            return Response(
                {
                    "detail": (
                        f"Payment attempt is already {attempt.status}; create a new checkout."
                    ),
                    "status": attempt.status,
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if attempt.redirect_url and attempt.payment_id:
            # Reuse the existing provider session — second click on
            # "Pay with bKash" shouldn't open two parallel tabs.
            return Response(
                {
                    "payment_id": attempt.payment_id,
                    "redirect_url": attempt.redirect_url,
                    "draft_id": attempt.id,
                    "reused": True,
                },
                status=http_status.HTTP_200_OK,
            )
        # Fresh create() against the same attempt — happens if the
        # provider rejected the first /create call (no redirect_url was
        # stored).
        try:
            with transaction.atomic():
                result = prov.create(
                    order=attempt.as_provider_stub(), amount=f"{attempt.amount:.2f}"
                )
                attempt.payment_id = result.payment_id
                attempt.redirect_url = result.redirect_url
                attempt.raw_response = result.raw
                attempt.save(
                    update_fields=[
                        "payment_id",
                        "redirect_url",
                        "raw_response",
                        "updated_at",
                    ]
                )
        except ProviderHTTPError as exc:
            return Response(
                {
                    "detail": "Payment provider rejected the request.",
                    "error": exc.body,
                },
                status=http_status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {
                "payment_id": attempt.payment_id,
                "redirect_url": attempt.redirect_url,
                "draft_id": attempt.id,
                "reused": False,
            },
            status=http_status.HTTP_201_CREATED,
        )

    # ------------------------------------------------------------------
    # Legacy path: caller passed an order_number, meaning an Order row
    # already exists (older FE build, or an admin-triggered payment).
    # We look it up, refuse if it's already paid, and otherwise create
    # a payment attempt attached to that Order. This stays in place so
    # an in-flight legacy session doesn't break — and so the admin's
    # "force create payment" tool (if ever added) still works.
    # ------------------------------------------------------------------
    order = get_object_or_404(Order, order_number=order_number, user=request.user)
    if order.paid_at is not None:
        return Response(
            {"detail": "Order is already paid.", "order": order.order_number},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    existing = (
        PaymentAttempt.objects.filter(order=order, provider=provider)
        .exclude(status__in={"Paid", "Failed", "Cancelled"})
        .first()
    )
    if existing is not None:
        return Response(
            {
                "payment_id": existing.payment_id,
                "redirect_url": existing.redirect_url,
                "reused": True,
            },
            status=http_status.HTTP_200_OK,
        )

    try:
        with transaction.atomic():
            result = prov.create(order=order, amount=str(order.total_amount))
            attempt = PaymentAttempt.objects.create(
                payment_id=result.payment_id,
                order=order,
                user=request.user,
                provider=provider,
                status="Initiated",
                redirect_url=result.redirect_url,
                raw_response=result.raw,
                draft_number=f"LEGACY-{order.order_number}",
                amount=order.total_amount,
                payment_method=order.shipping_address.get("payment_method", provider),
                items=order.items,
                shipping_address=order.shipping_address,
            )
    except ProviderHTTPError as exc:
        return Response(
            {"detail": "Payment provider rejected the request.", "error": exc.body},
            status=http_status.HTTP_502_BAD_GATEWAY,
        )

    return Response(
        {
            "payment_id": attempt.payment_id,
            "redirect_url": attempt.redirect_url,
            "reused": False,
        },
        status=http_status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------------------------
# execute (FE polling + callback verification)
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payment_execute(request, provider: str):
    """Verify a payment and, on success, mark the order paid.

    Body: ``{"payment_id": "..."}``

    Handles both flows:
      * Legacy attempts where ``order`` was created at checkout — we
        stamp paid_at / paid_via on the existing Order.
      * New deferred-Order attempts where ``order=NULL`` — we call
        ``_materialize_order_from_attempt`` to build the Order from the
        snapshot, decrement stock, and clear the cart. The returned
        ``order`` field is the freshly-created order_number either way.
    """
    payment_id = request.data.get("payment_id") or request.data.get("paymentID")
    if not payment_id:
        return Response(
            {"detail": "payment_id is required."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Match the attempt by user — attempts with order=NULL won't match
    # via the legacy ``order__user=`` filter, so scope by user directly.
    attempt_qs = PaymentAttempt.objects.filter(
        payment_id=payment_id, provider=provider, user=request.user
    )
    if not attempt_qs.exists():
        return Response(
            {"detail": "Payment attempt not found."},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    attempt = attempt_qs.first()

    if attempt.is_terminal:
        order_number = attempt.order.order_number if attempt.has_order else None
        return Response(
            {
                "payment_id": payment_id,
                "status": attempt.status,
                "order": order_number,
                "already_finalized": True,
            },
            status=http_status.HTTP_200_OK,
        )

    prov = _provider(provider)
    try:
        result = prov.execute(payment_id=payment_id)
    except ProviderHTTPError as exc:
        attempt.status = "Failed"
        attempt.raw_response = exc.body if isinstance(exc.body, dict) else {"error": str(exc.body)}
        attempt.save(update_fields=["status", "raw_response", "updated_at"])
        return Response(
            {"detail": "Payment provider error.", "error": exc.body},
            status=http_status.HTTP_502_BAD_GATEWAY,
        )

    attempt.raw_response = result.raw
    if result.status == "Paid" and attempt.status != "Paid":
        attempt.status = "Paid"
        if attempt.has_order:
            # Legacy flow — the Order already exists; just stamp it.
            with transaction.atomic():
                order = attempt.order
                if order.paid_at is None:
                    order.paid_at = timezone.now()
                    order.paid_via = provider
                    order.status = "Confirmed"
                    order.status_notes = f"Payment received via {provider.title()}."
                    order.save(
                        update_fields=["paid_at", "paid_via", "status", "status_notes"]
                    )
        else:
            # New deferred-Order flow — build the Order from the
            # snapshot. Decrement stock + clear cart happen inside.
            _materialize_order_from_attempt(attempt)
    elif result.status in {"Failed", "Cancelled"} and not attempt.is_terminal:
        attempt.status = result.status
    attempt.save(update_fields=["status", "raw_response", "updated_at"])

    order_number = attempt.order.order_number if attempt.has_order else None
    return Response(
        {
            "payment_id": payment_id,
            "status": attempt.status,
            "order": order_number,
        },
        status=http_status.HTTP_200_OK,
    )


# ---------------------------------------------------------------------------
# return — browser redirect after the hosted payment page
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payment_return(request, provider: str):
    """Browser-side landing page after the hosted bKash/Nagad page closes.

    The provider may or may not append the payment ID; we accept either
    ``paymentID`` or ``payment_id`` query params. We synchronously call
    ``execute`` so the customer doesn't see a "pending" page; then we
    302 to the order detail page where the FE reads the fresh
    ``paid_at`` value.

    New flow: if the attempt has no Order yet (Paid just materialised
    one, or the user closed the tab before completing), we redirect to
    ``/orders/<number>`` (after a Paid) or back to ``/checkout`` (on
    cancel/close). We deliberately do NOT bounce them to
    ``/orders/UNKNOWN`` — that 404'd on the legacy flow.
    """
    payment_id = request.query_params.get("paymentID") or request.query_params.get("payment_id")
    order_number = request.query_params.get("order")
    frontend_base = (
        settings.FRONTEND_BASE_URL
        or settings.HUB_BASE_URL
        or "http://127.0.0.1:5173"
    ).rstrip("/")

    if not payment_id:
        # No payment id → user closed the tab. Send them to checkout
        # so the cart is still intact and they can retry the payment.
        return redirect(f"{frontend_base}/checkout")

    try:
        attempt = PaymentAttempt.objects.get(payment_id=payment_id, provider=provider)
    except PaymentAttempt.DoesNotExist:
        return redirect(f"{frontend_base}/checkout")

    # Always run execute on return so the FE never sees "Pending" if the
    # provider already approved. Same status flow as the polling path.
    prov = _provider(provider)
    try:
        result = prov.execute(payment_id=payment_id)
        attempt.raw_response = result.raw
        if result.status == "Paid" and attempt.status != "Paid":
            attempt.status = "Paid"
            if attempt.has_order:
                # Legacy flow — the Order already exists; just stamp it.
                with transaction.atomic():
                    order = attempt.order
                    if order.paid_at is None:
                        order.paid_at = timezone.now()
                        order.paid_via = provider
                        order.status = "Confirmed"
                        order.status_notes = f"Payment received via {provider.title()}."
                        order.save(
                            update_fields=["paid_at", "paid_via", "status", "status_notes"]
                        )
            else:
                # New deferred-Order flow — materialise the Order from
                # the snapshot so /orders/<number> 200s after the 302.
                _materialize_order_from_attempt(attempt)
        elif result.status in {"Failed", "Cancelled"} and not attempt.is_terminal:
            attempt.status = result.status
        attempt.save(update_fields=["status", "raw_response", "updated_at"])
    except ProviderHTTPError:
        # Provider was unreachable. Redirect anyway; the FE polling path
        # will retry and the customer can refresh.
        pass

    target_order = (
        order_number
        or (attempt.order.order_number if attempt.has_order else None)
    )
    if target_order:
        return redirect(f"{frontend_base}/orders/{target_order}")
    # No Order yet — cart is intact, send the user back to /checkout.
    return redirect(f"{frontend_base}/checkout")