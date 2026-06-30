import random
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.products.models import Product

from .models import Cart, CartItem, Order, WishList
from .serializers import (
    AddToCartSerializer,
    CartSerializer,
    CheckoutSerializer,
    OrderSerializer,
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
        return Response(
            {"detail": "Not enough stock."}, status=status.HTTP_400_BAD_REQUEST
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
    item.quantity = serializer.validated_data["quantity"]
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

    # Online payments (card / PayPal) are captured at checkout time, so the
    # order is auto-confirmed and counts toward revenue immediately. Cash on
    # delivery stays Pending until the admin manually confirms receipt.
    payment_method = (request.data.get("payment_method") or "cod").lower()
    is_online_payment = payment_method in {"card", "paypal"}
    initial_status = "Confirmed" if is_online_payment else "Pending"
    initial_notes = (
        f"Payment received via {payment_method.title()}."
        if is_online_payment
        else "Awaiting admin review (cash on delivery)."
    )

    with transaction.atomic():
        snap = [_serialize_product_snapshot(i.product, i.quantity) for i in items]
        subtotal = sum(Decimal(i["subtotal"]) for i in snap)
        # Tax is calculated on the merchandise subtotal only (BD VAT rules);
        # shipping is not taxed. Rounded to 2 dp using quantize so the line
        # totals stay consistent with the displayed Total.
        tax = (subtotal * TAX_RATE).quantize(Decimal("0.01"))
        total = subtotal + SHIPPING_FEE + tax
        # Online payments are captured at checkout → mark paid immediately so
        # revenue analytics reflect them. COD orders stay unpaid until an
        # admin confirms receipt via the mark-paid endpoint.
        paid_at = timezone.now() if is_online_payment else None
        paid_via = payment_method if is_online_payment else ""
        order = Order.objects.create(
            order_number=_generate_order_number(),
            user=request.user,
            items=snap,
            total_amount=total,
            shipping_address={
                **address,
                "payment_method": payment_method,
                "subtotal": str(subtotal),
                "shipping_fee": str(SHIPPING_FEE),
                "tax": str(tax),
                "tax_rate": str(TAX_RATE),
            },
            estimated_arrival=(timezone.now().date() + timedelta(days=5)),
            status=initial_status,
            status_notes=initial_notes,
            paid_at=paid_at,
            paid_via=paid_via,
        )
        # Decrement stock and clear cart
        for i in items:
            i.product.stock = max(i.product.stock - i.quantity, 0)
            i.product.save(update_fields=["stock"])
        cart.items.all().delete()

    return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


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