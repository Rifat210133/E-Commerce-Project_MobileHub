import random
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.dashboard.permissions import IsAdminStaff
from apps.payments.bkash import BkashSandboxProvider
from apps.payments.http import ProviderHTTPError
from apps.payments.models import PaymentAttempt, generate_draft_number
from apps.payments.nagad import NagadSandboxProvider
from apps.products.models import Product

from .models import Cart, CartItem, Order, ReturnRequest, WishList
from .serializers import (
    AddToCartSerializer,
    CartSerializer,
    CheckoutSerializer,
    CreateReturnRequestSerializer,
    OrderSerializer,
    ReturnRequestSerializer,
    UpdateCartItemSerializer,
    WishListSerializer,
)


SHIPPING_FEE = Decimal("9.99")
# Bangladesh VAT on retail electronics (mobile phones & accessories).
# Applied to the merchandise subtotal — shipping is not taxed per BD VAT rules.
TAX_RATE = Decimal("0.15")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_or_create_cart(user) -> Cart:
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


def _generate_order_number() -> str:
    while True:
        number = f"MH-{random.randint(10000, 99999)}"
        if not Order.objects.filter(order_number=number).exists():
            return number


def _serialize_product_snapshot(product: Product, quantity: int) -> dict:
    return {
        "product_id": product.id,
        "product_slug": product.slug,
        "product_name": product.name,
        "brand_name": product.brand.name,
        "image": product.images[0] if product.images else None,
        "price": str(product.price),
        "quantity": quantity,
        "subtotal": str(product.price * quantity),
    }


# ---------------------------------------------------------------------------
# Cart endpoints
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cart_detail(request):
    cart = _get_or_create_cart(request.user)
    return Response(CartSerializer(cart).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cart_add(request):
    serializer = AddToCartSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    product_id = serializer.validated_data["product_id"]
    quantity = serializer.validated_data["quantity"]

    product = get_object_or_404(Product, pk=product_id, is_active=True)
    if product.stock < quantity:
        # Echo back the actual stock + requested quantity so the UI can
        # render a useful "Only N in stock — you asked for M" toast and
        # clamp the qty selector to what's actually available.
        return Response(
            {
                "detail": "Not enough stock.",
                "available": product.stock,
                "requested": quantity,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    cart = _get_or_create_cart(request.user)
    item, created = CartItem.objects.get_or_create(
        cart=cart, product=product, defaults={"quantity": quantity}
    )
    if not created:
        item.quantity += quantity
        item.save(update_fields=["quantity"])

    return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def cart_update(request, item_id: int):
    serializer = UpdateCartItemSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    cart = _get_or_create_cart(request.user)
    item = get_object_or_404(CartItem, pk=item_id, cart=cart)
    quantity = serializer.validated_data["quantity"]
    if item.product.stock < quantity:
        # Mirror the cart_add stock-exceeded payload so the cart-line UI
        # can show 'Only N in stock — you asked for M' instead of failing
        # silently or showing a generic error.
        return Response(
            {
                "detail": "Not enough stock.",
                "available": item.product.stock,
                "requested": quantity,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    item.quantity = quantity
    item.save(update_fields=["quantity"])
    return Response(CartSerializer(cart).data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def cart_remove(request, item_id: int):
    cart = _get_or_create_cart(request.user)
    CartItem.objects.filter(pk=item_id, cart=cart).delete()
    return Response(CartSerializer(cart).data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def cart_clear(request):
    cart = _get_or_create_cart(request.user)
    cart.items.all().delete()
    return Response(CartSerializer(cart).data)


# ---------------------------------------------------------------------------
# Order endpoints
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checkout(request):
    serializer = CheckoutSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    address = serializer.validated_data["shipping_address"]

    cart = _get_or_create_cart(request.user)
    items = list(cart.items.select_related("product", "product__brand"))
    if not items:
        return Response(
            {"detail": "Your cart is empty."}, status=status.HTTP_400_BAD_REQUEST
        )

    payment_method = (request.data.get("payment_method") or "cod").lower()
    is_online = payment_method in {"bkash", "nagad"}

    # ------------------------------------------------------------------
    # Pre-compute amounts and the cart snapshot. Same on every path so
    # the FE sees consistent totals whether we materialise the Order
    # now (COD) or hand them off to the gateway (bKash / Nagad).
    # ------------------------------------------------------------------
    snap = [_serialize_product_snapshot(i.product, i.quantity) for i in items]
    subtotal = sum(Decimal(i["subtotal"]) for i in snap)
    tax = (subtotal * TAX_RATE).quantize(Decimal("0.01"))
    total = subtotal + SHIPPING_FEE + tax
    shipping_address = {
        **address,
        "payment_method": payment_method,
        "subtotal": str(subtotal),
        "shipping_fee": str(SHIPPING_FEE),
        "tax": str(tax),
        "tax_rate": str(TAX_RATE),
    }

    # ------------------------------------------------------------------
    # COD — keep the legacy behaviour: create the Order right away,
    # decrement stock, clear the cart. The Order stays "Pending" until
    # the admin marks it paid; no PaymentAttempt is involved.
    # ------------------------------------------------------------------
    if not is_online:
        with transaction.atomic():
            order = Order.objects.create(
                order_number=_generate_order_number(),
                user=request.user,
                items=snap,
                total_amount=total,
                shipping_address=shipping_address,
                estimated_arrival=(timezone.now().date() + timedelta(days=5)),
                status="Pending",
                status_notes="Awaiting admin review (cash on delivery).",
                paid_at=None,
                paid_via="",
            )
            for i in items:
                i.product.stock = max(i.product.stock - i.quantity, 0)
                i.product.save(update_fields=["stock"])
            cart.items.all().delete()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # Online payment (bKash / Nagad) — defer Order creation.
    # Snapshot the cart + address onto a fresh PaymentAttempt, hand it
    # to the provider's create() so the customer gets redirected to the
    # hosted page, but DO NOT decrement stock, clear the cart, or
    # create an Order. The Order is materialised by
    # ``apps.payments.views.payment_execute`` only after the gateway
    # confirms the payment. If the user abandons / cancels, the
    # PaymentAttempt just sits in Initiated state and the cart survives.
    # ------------------------------------------------------------------
    from django.conf import settings as _s

    if payment_method not in _s.FEATURE_PAYMENT_METHODS:
        return Response(
            {"detail": f"{payment_method.title()} is currently disabled."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Stock is still checked upfront so the customer doesn't reach the
    # gateway only to bounce off a "not enough stock" error after
    # paying. We do NOT decrement — that happens at materialisation.
    for i in items:
        if i.product.stock < i.quantity:
            return Response(
                {
                    "detail": "Not enough stock.",
                    "available": i.product.stock,
                    "requested": i.quantity,
                    "product_id": i.product.id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    provider_cls = (
        BkashSandboxProvider if payment_method == "bkash" else NagadSandboxProvider
    )
    prov = provider_cls()
    amount_str = f"{total:.2f}"

    with transaction.atomic():
        # Create the attempt with order=NULL. The user + draft_number
        # are what the provider stub exposes in lieu of a real Order.
        attempt = PaymentAttempt.objects.create(
            payment_id=f"PA-{random.randint(10**8, 10**9 - 1)}",
            order=None,
            user=request.user,
            provider=payment_method,
            status="Initiated",
            redirect_url="",
            draft_number=generate_draft_number(),
            amount=total,
            payment_method=payment_method,
            items=snap,
            shipping_address=shipping_address,
            raw_response={},
        )
        try:
            result = prov.create(order=attempt.as_provider_stub(), amount=amount_str)
        except ProviderHTTPError as exc:
            # Provider rejected before anything left the building — the
            # attempt is discarded along with the enclosing transaction.
            return Response(
                {
                    "detail": "Payment provider rejected the request.",
                    "error": exc.body,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        attempt.payment_id = result.payment_id
        attempt.redirect_url = result.redirect_url
        attempt.raw_response = result.raw
        attempt.save(update_fields=["payment_id", "redirect_url", "raw_response", "updated_at"])

    # The FE opens redirect_url in a new tab and then polls
    # ``/api/payments/{provider}/status/<payment_id>/`` until the
    # gateway confirms. Order is created inside payment_execute.
    return Response(
        {
            "payment_id": attempt.payment_id,
            "redirect_url": attempt.redirect_url,
            "draft_id": attempt.id,
            "draft_number": attempt.draft_number,
            "amount": str(attempt.amount),
            "payment_method": payment_method,
            "order_number": None,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def order_list(request):
    qs = Order.objects.filter(user=request.user).order_by("-created_at")
    status_param = request.query_params.get("status")
    if status_param:
        qs = qs.filter(status__iexact=status_param)
    return Response(OrderSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def order_detail(request, order_number: str):
    order = get_object_or_404(Order, order_number=order_number, user=request.user)
    return Response(OrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_received(request, order_number: str):
    """Customer-driven transition from ``Delivered`` to ``Received``.

    Marks the order as received by the buyer, stamps ``received_at`` and
    fires a customer-facing confirmation + admin notification via the
    notifications signal pipeline. Refused for any state other than
    ``Delivered`` (so the button cannot double-fire or skip ahead).
    """
    order = get_object_or_404(Order, order_number=order_number, user=request.user)
    if order.status != "Delivered":
        return Response(
            {
                "detail": (
                    f"Only delivered orders can be confirmed as received "
                    f"(current status: '{order.status}')."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Customer-side comment (e.g. "package was opened", "all good") is
    # optional. We store it in status_notes so the admin dashboard can
    # surface it alongside the Received status.
    note = (request.data.get("note") or "").strip()
    order.status = "Received"
    order.received_at = timezone.now()
    if note:
        order.status_notes = note
    # save() triggers the post_save signal which emits the customer +
    # admin notification rows.
    order.save()

    return Response(OrderSerializer(order).data)


# ---------------------------------------------------------------------------
# Wishlist endpoints
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def wishlist_detail(request):
    wl, _ = WishList.objects.get_or_create(user=request.user)
    return Response(WishListSerializer(wl).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def wishlist_add(request, product_id: int):
    product = get_object_or_404(Product, pk=product_id, is_active=True)
    wl, _ = WishList.objects.get_or_create(user=request.user)
    wl.products.add(product)
    return Response(WishListSerializer(wl).data, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def wishlist_remove(request, product_id: int):
    wl, _ = WishList.objects.get_or_create(user=request.user)
    wl.products.remove(product_id)
    return Response(WishListSerializer(wl).data)


# ---------------------------------------------------------------------------
# Return requests (customer-side)
# ---------------------------------------------------------------------------
def _active_return_policy():
    """Return the currently-active ReturnPolicy or None."""
    # Imported lazily to avoid an import cycle when apps.policies loads.
    from apps.policies.models import ReturnPolicy

    return ReturnPolicy.objects.filter(is_active=True).first()


def _return_window_days_for_order(order: Order) -> int | None:
    """Resolve the active return window (days).

    Falls back to the active policy's ``return_window_days``. Returns
    ``None`` if no policy exists (we treat that as "no returns allowed"
    to be safe).
    """
    policy = _active_return_policy()
    if not policy:
        return None
    return int(policy.return_window_days)


def _return_deadline(order: Order):
    """Return the absolute deadline (datetime) past which returns are
    refused for this order. ``None`` if the order isn't eligible yet or
    no policy is active."""
    window = _return_window_days_for_order(order)
    if not window:
        return None
    # Anchor on delivered_at when available; otherwise fall back to
    # created_at so legacy orders (delivered before we tracked the field)
    # still get a window. The customer / OrderDetail UI is responsible
    # for not surfacing the request flow on orders that aren't Delivered.
    anchor = order.delivered_at or order.created_at
    if anchor is None:
        return None
    return anchor + timedelta(days=window)


def _quantity_already_returned(order: Order, product_id: int) -> int:
    """Sum of quantity_returned for this product across all non-cancelled
    return requests on this order."""
    total = 0
    for rr in order.return_requests.exclude(status=ReturnRequest.STATUS_CANCELLED):
        for line in rr.items or []:
            if int(line.get("product_id", 0)) == int(product_id):
                total += int(line.get("quantity_returned", 0) or 0)
    return total


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def order_returns(request, order_number: str):
    """List (GET) or create (POST) a return request for one of the
    caller's orders.

    Eligibility rules enforced server-side:
      * Order belongs to request.user (404 otherwise).
      * Order is in ``Delivered`` status.
      * A return policy exists with is_active=True.
      * ``now`` ≤ order.delivered_at (or created_at) + return_window_days.
      * Each requested product_id is in the order's items.
      * quantity_returned ≤ (item.quantity - already_returned).
      * At least one valid line.
    """
    order = get_object_or_404(Order, order_number=order_number, user=request.user)

    if request.method == "GET":
        qs = order.return_requests.order_by("-created_at")
        return Response(ReturnRequestSerializer(qs, many=True).data)

    # POST — create
    # Returns are allowed for both "Delivered" and "Received" orders:
    # the buyer's confirmation of receipt doesn't close the return window,
    # it just marks the order as closed from the customer's side.
    if order.status not in {"Delivered", "Received"}:
        return Response(
            {"detail": "Only delivered orders are eligible for return."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    policy = _active_return_policy()
    if not policy:
        return Response(
            {"detail": "No return policy is currently active."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    deadline = _return_deadline(order)
    if deadline is None or timezone.now() > deadline:
        return Response(
            {
                "detail": (
                    f"The return window of {policy.return_window_days} day(s) has passed."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = CreateReturnRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    payload_items = serializer.validated_data["items"]
    reason = serializer.validated_data["reason"].strip()

    # Validate against the order's items. Build a lookup of the order's
    # product_id → {quantity, name, image}.
    order_items_index: dict[int, dict] = {}
    for it in order.items or []:
        pid = int(it.get("product_id", 0) or 0)
        if pid:
            order_items_index[pid] = {
                "quantity": int(it.get("quantity", 0) or 0),
                "name": it.get("product_name", ""),
                "image": it.get("image") or None,
            }

    snapshot = []
    for line in payload_items:
        pid = int(line["product_id"])
        qty = int(line["quantity_returned"])
        in_order = order_items_index.get(pid)
        if not in_order:
            return Response(
                {"detail": f"Product {pid} is not part of this order."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        already = _quantity_already_returned(order, pid)
        remaining = in_order["quantity"] - already
        if qty > remaining:
            return Response(
                {
                    "detail": (
                        f"Only {remaining} of '{in_order['name']}' is still "
                        f"eligible to return (you requested {qty})."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        snapshot.append(
            {
                "product_id": pid,
                "product_name": in_order["name"],
                "quantity_returned": qty,
                "image": in_order["image"],
            }
        )

    if not snapshot:
        return Response(
            {"detail": "At least one returnable item is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    rr = ReturnRequest.objects.create(
        order=order,
        user=request.user,
        reason=reason,
        items=snapshot,
        status=ReturnRequest.STATUS_REQUESTED,
    )

    # Best-effort admin notification. If the notifications app is missing
    # we swallow the error so the create flow still works.
    try:
        from apps.notifications.signals import _emit_admins

        _emit_admins(
            kind="return_requested",
            level="info",
            title=f"Return requested on {order.order_number}",
            body=(
                f"{request.user.email} requested to return "
                f"{rr.total_quantity} item(s)."
            ),
            order=order,
            meta={"return_id": rr.id, "order_number": order.order_number},
        )
    except Exception:
        pass

    # Mirror the request to the customer's own bell so they get a
    # "we received your return" confirmation immediately, matching the
    # behavior of approve/reject/refund below.
    _notify_customer_return(
        order,
        rr,
        kind="return_requested",
        level="info",
        title=f"Return submitted for #{order.order_number}",
        body=(
            f"We received your return request for {rr.total_quantity} item(s). "
            "Our team will review it shortly."
        ),
        meta={"return_id": rr.id, "status": rr.status},
    )

    return Response(
        ReturnRequestSerializer(rr).data, status=status.HTTP_201_CREATED
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_return(request, return_id: int):
    """Customer cancels their own pending return request."""
    rr = get_object_or_404(ReturnRequest, pk=return_id, user=request.user)
    if rr.status != ReturnRequest.STATUS_REQUESTED:
        return Response(
            {"detail": f"Cannot cancel a return in '{rr.status}' state."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    rr.status = ReturnRequest.STATUS_CANCELLED
    rr.decided_at = timezone.now()
    rr.save(update_fields=["status", "decided_at", "updated_at"])
    return Response(ReturnRequestSerializer(rr).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_returns(request):
    """All return requests for the current customer (across orders)."""
    qs = (
        ReturnRequest.objects.filter(user=request.user)
        .select_related("order")
        .order_by("-created_at")
    )
    return Response(ReturnRequestSerializer(qs, many=True).data)


# ---------------------------------------------------------------------------
# Return requests (admin-side)
# ---------------------------------------------------------------------------
def _notify_customer_return(order: Order, rr: ReturnRequest, kind: str, level: str,
                            title: str, body: str, meta: dict | None = None):
    """Best-effort customer notification helper."""
    try:
        from apps.notifications.signals import _emit_customer

        _emit_customer(order, kind=kind, level=level, title=title, body=body,
                       meta=meta or {})
    except Exception:
        pass


@api_view(["GET"])
@permission_classes([IsAdminStaff])
def admin_return_list(request):
    """List every return request, newest first. Optional ?status= filter."""
    qs = (
        ReturnRequest.objects
        .select_related("order", "user")
        .order_by("-created_at")
    )
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status__iexact=status_filter)
    return Response(ReturnRequestSerializer(qs, many=True).data)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminStaff])
def admin_return_detail(request, return_id: int):
    rr = get_object_or_404(
        ReturnRequest.objects.select_related("order", "user"), pk=return_id
    )

    if request.method == "GET":
        return Response(ReturnRequestSerializer(rr).data)

    if request.method == "DELETE":
        # Hard delete — admin override (e.g. duplicate / spam). Don't
        # touch order.status or stock; the request was never approved.
        rr.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — admin note only. Status transitions go through the
    # dedicated approve / reject / refund endpoints below so the
    # side-effects stay consistent.
    note = request.data.get("admin_note")
    if note is None:
        return Response(
            {"detail": "Only 'admin_note' is editable via PATCH."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    rr.admin_note = note
    rr.save(update_fields=["admin_note", "updated_at"])
    return Response(ReturnRequestSerializer(rr).data)


def _transition(rr: ReturnRequest, new_status: str, *, restore_stock: bool = False,
                notify: tuple | None = None):
    """Apply a status transition + side-effects in one transaction.

    notify=(kind, level, title, body, meta) — if provided, fan out a
    customer notification. restore_stock=True restores inventory for the
    returned items (only safe on Approved / Refunded; we only call it on
    Refunded so a single restore happens after the admin confirms money
    has gone back).
    """
    with transaction.atomic():
        rr.status = new_status
        rr.decided_at = timezone.now()
        rr.save(update_fields=["status", "decided_at", "updated_at"])

        if restore_stock:
            for line in rr.items or []:
                pid = int(line.get("product_id", 0) or 0)
                qty = int(line.get("quantity_returned", 0) or 0)
                if pid and qty:
                    Product.objects.filter(pk=pid).update(
                        stock=F("stock") + qty
                    )

        if notify:
            kind, level, title, body, meta = notify
            _notify_customer_return(
                rr.order, rr, kind=kind, level=level, title=title, body=body,
                meta=meta,
            )


@api_view(["POST"])
@permission_classes([IsAdminStaff])
def admin_return_approve(request, return_id: int):
    """Approve a pending return. Stock is *not* restored here — that's
    deferred to the Refunded step so we don't inflate inventory until
    the customer has actually been refunded."""
    rr = get_object_or_404(
        ReturnRequest.objects.select_related("order"), pk=return_id
    )
    if rr.status != ReturnRequest.STATUS_REQUESTED:
        return Response(
            {"detail": f"Cannot approve a return in '{rr.status}' state."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    rr.admin_note = request.data.get("admin_note", rr.admin_note)
    _transition(
        rr,
        ReturnRequest.STATUS_APPROVED,
        notify=(
            "return_approved",
            "success",
            f"Your return for #{rr.order.order_number} was approved",
            "We've approved your return. The refund will be processed once we receive the items.",
            {"return_id": rr.id, "order_number": rr.order.order_number},
        ),
    )
    rr.save(update_fields=["admin_note", "updated_at"])
    return Response(ReturnRequestSerializer(rr).data)


@api_view(["POST"])
@permission_classes([IsAdminStaff])
def admin_return_reject(request, return_id: int):
    rr = get_object_or_404(
        ReturnRequest.objects.select_related("order"), pk=return_id
    )
    if rr.status != ReturnRequest.STATUS_REQUESTED:
        return Response(
            {"detail": f"Cannot reject a return in '{rr.status}' state."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    note = request.data.get("admin_note", "").strip()
    rr.admin_note = note
    _transition(
        rr,
        ReturnRequest.STATUS_REJECTED,
        notify=(
            "return_rejected",
            "warning",
            f"Your return for #{rr.order.order_number} was rejected",
            (note or "Please contact support if you have any questions."),
            {"return_id": rr.id, "order_number": rr.order.order_number},
        ),
    )
    rr.save(update_fields=["admin_note", "updated_at"])
    return Response(ReturnRequestSerializer(rr).data)


@api_view(["POST"])
@permission_classes([IsAdminStaff])
def admin_return_refund(request, return_id: int):
    """Mark an approved return as Refunded. This is the only point at
    which stock is restored to inventory (using an atomic F() update
    so concurrent admin edits can't lose the increment)."""
    rr = get_object_or_404(
        ReturnRequest.objects.select_related("order"), pk=return_id
    )
    if rr.status != ReturnRequest.STATUS_APPROVED:
        return Response(
            {"detail": f"Only approved returns can be refunded (current: '{rr.status}')."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    note = request.data.get("admin_note", rr.admin_note)
    if note:
        rr.admin_note = note
    _transition(
        rr,
        ReturnRequest.STATUS_REFUNDED,
        restore_stock=True,
        notify=(
            "return_refunded",
            "success",
            f"Refund processed for #{rr.order.order_number}",
            f"{rr.total_quantity} item(s) refunded. Stock has been restored.",
            {"return_id": rr.id, "order_number": rr.order.order_number},
        ),
    )
    if note:
        rr.save(update_fields=["admin_note", "updated_at"])
    return Response(ReturnRequestSerializer(rr).data)