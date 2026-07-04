"""Payment integration endpoints.

Three endpoints per provider (bKash, Nagad):

* ``POST .../create/``  body ``{order_number}`` → ``{payment_id, redirect_url}``
* ``POST .../execute/`` body ``{payment_id}``  → ``{status, payment_id}``
* ``GET  .../return/``  query ``?paymentID=…&order=…`` → 302 to order page

Why we don't combine create+execute:
bKash / Nagad require the user to interact with a hosted page (the
``bkashURL`` / ``callBackUrl``) before the payment is finalized. The
FE opens that URL in a new tab, the user confirms, then the FE polls
``execute`` until the status flips to ``Paid`` — at which point the
order is marked paid.

The ``create`` endpoint is the idempotency boundary: re-posting the
same ``order_number`` returns the existing attempt instead of issuing a
new ``paymentID`` (which would orphan the first one in the provider).
"""
from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.orders.models import Order

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


# ---------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payment_create(request, provider: str):
    """Issue a payment session with the provider for an unpaid order.

    Idempotent on ``order_number``: a second call returns the existing
    attempt's ``payment_id`` so the FE doesn't have to worry about
    double-clicks.

    Body: ``{"order_number": "MH-12345"}``
    """
    if provider not in settings.FEATURE_PAYMENT_METHODS:
        return Response(
            {"detail": f"{provider.title()} is currently disabled."},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    order_number = request.data.get("order_number") or request.data.get("order")
    if not order_number:
        return Response(
            {"detail": "order_number is required."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    order = get_object_or_404(Order, order_number=order_number, user=request.user)
    if order.paid_at is not None:
        return Response(
            {"detail": "Order is already paid.", "order": order.order_number},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    prov = _provider(provider)
    # Idempotency: re-use an existing Initiated attempt for the same order.
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
                provider=provider,
                status="Initiated",
                redirect_url=result.redirect_url,
                raw_response=result.raw,
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
    """
    payment_id = request.data.get("payment_id") or request.data.get("paymentID")
    if not payment_id:
        return Response(
            {"detail": "payment_id is required."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    attempt = get_object_or_404(
        PaymentAttempt, payment_id=payment_id, provider=provider, order__user=request.user
    )
    if attempt.is_terminal:
        return Response(
            {
                "payment_id": payment_id,
                "status": attempt.status,
                "order": attempt.order.order_number,
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
        with transaction.atomic():
            order = attempt.order
            if order.paid_at is None:
                order.paid_at = timezone.now()
                order.paid_via = provider
                # Online payments auto-confirm so revenue analytics pick
                # them up. ``status_notes`` mirrors the message the legacy
                # card/PayPal branch used to write.
                order.status = "Confirmed"
                order.status_notes = f"Payment received via {provider.title()}."
                order.save(update_fields=["paid_at", "paid_via", "status", "status_notes"])
    elif result.status in {"Failed", "Cancelled"} and not attempt.is_terminal:
        attempt.status = result.status
    attempt.save(update_fields=["status", "raw_response", "updated_at"])

    return Response(
        {
            "payment_id": payment_id,
            "status": attempt.status,
            "order": attempt.order.order_number,
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
    """
    payment_id = request.query_params.get("paymentID") or request.query_params.get("payment_id")
    order_number = request.query_params.get("order")
    if not payment_id:
        # No payment id → user closed the tab. Send them to the order list
        # rather than a 400 page.
        return redirect("/orders")

    try:
        attempt = PaymentAttempt.objects.get(payment_id=payment_id, provider=provider)
    except PaymentAttempt.DoesNotExist:
        return redirect("/orders")

    # Always run execute on return so the FE never sees "Pending" if the
    # provider already approved. Same status flow as the polling path.
    prov = _provider(provider)
    try:
        result = prov.execute(payment_id=payment_id)
        attempt.raw_response = result.raw
        if result.status == "Paid" and attempt.status != "Paid":
            attempt.status = "Paid"
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
        elif result.status in {"Failed", "Cancelled"} and not attempt.is_terminal:
            attempt.status = result.status
        attempt.save(update_fields=["status", "raw_response", "updated_at"])
    except ProviderHTTPError:
        # Provider was unreachable. Redirect anyway; the FE polling path
        # will retry and the customer can refresh.
        pass

    target_order = order_number or attempt.order.order_number
    return redirect(f"/orders/{target_order}")