from decimal import Decimal

from rest_framework import serializers

from apps.products.models import Product
from apps.products.serializers import ProductListSerializer

from .models import Cart, CartItem, Order, ReturnRequest, WishList


class CartItemSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    item_id = serializers.IntegerField(source="id", read_only=True)

    class Meta:
        model = CartItem
        fields = ("item_id", "product", "quantity", "subtotal")


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    subtotal = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cart
        fields = ("id", "items", "subtotal", "item_count", "updated_at")


class AddToCartSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, default=1)


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class OrderItemSerializer(serializers.Serializer):
    """Snapshot of a product inside an order."""

    product_id = serializers.IntegerField()
    product_slug = serializers.CharField()
    product_name = serializers.CharField()
    brand_name = serializers.CharField()
    image = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    quantity = serializers.IntegerField(min_value=1)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)


class ShippingAddressSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=32)
    address_line1 = serializers.CharField(max_length=200)
    address_line2 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    # Bangladesh admin-area cascade — Division → District → Upazila replaces
    # the old free-text city/state fields, so the form has no City/State
    # inputs anymore.
    division = serializers.CharField(max_length=60)
    district = serializers.CharField(max_length=80)
    upazila = serializers.CharField(max_length=80)
    postal_code = serializers.CharField(max_length=20)
    country = serializers.CharField(max_length=80, default="Bangladesh")


class CheckoutSerializer(serializers.Serializer):
    shipping_address = ShippingAddressSerializer()


class OrderSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    shipping_fee = serializers.SerializerMethodField()
    tax = serializers.SerializerMethodField()
    payment_method = serializers.SerializerMethodField()
    is_paid = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "items",
            "item_count",
            "subtotal",
            "shipping_fee",
            "tax",
            "total_amount",
            "status",
            "shipping_address",
            "payment_method",
            "paid_at",
            "paid_via",
            "is_paid",
            "estimated_arrival",
            "status_notes",
            "created_at",
            "updated_at",
        )

    def get_payment_method(self, obj):
        addr = obj.shipping_address or {}
        return (addr.get("payment_method") or "").lower()

    def get_is_paid(self, obj):
        return obj.paid_at is not None

    def get_item_count(self, obj):
        items = obj.items if isinstance(obj.items, list) else []
        return sum(int(i.get("quantity", 0) or 0) for i in items)

    def get_subtotal(self, obj):
        items = obj.items if isinstance(obj.items, list) else []
        total = Decimal("0")
        for i in items:
            line = i.get("subtotal")
            if line is None:
                price = Decimal(str(i.get("price", 0) or 0))
                qty = int(i.get("quantity", 0) or 0)
                line = price * qty
            total += Decimal(str(line))
        return total

    def get_shipping_fee(self, obj):
        addr = obj.shipping_address or {}
        shipping = addr.get("shipping_fee")
        if shipping is not None:
            return Decimal(str(shipping))
        # Backfill for legacy orders: derive shipping from total - subtotal - tax.
        return max(Decimal(str(obj.total_amount)) - self.get_subtotal(obj) - self.get_tax(obj), Decimal("0"))

    def get_tax(self, obj):
        addr = obj.shipping_address or {}
        tax = addr.get("tax")
        if tax is not None:
            return Decimal(str(tax))
        # Backfill for legacy orders without a stored tax line: reapply the
        # 15% BD VAT rate against the item subtotal so older orders display
        # the same tax amount they'd have if placed today.
        rate = Decimal(str(addr.get("tax_rate", "0.15")))
        return (self.get_subtotal(obj) * rate).quantize(Decimal("0.01"))


class WishListSerializer(serializers.ModelSerializer):
    products = ProductListSerializer(many=True, read_only=True)

    class Meta:
        model = WishList
        fields = ("id", "products", "created_at")


# ---------------------------------------------------------------------------
# Return requests
# ---------------------------------------------------------------------------
class ReturnRequestItemSerializer(serializers.Serializer):
    """One line on a return request — partial / per-product info."""

    product_id = serializers.IntegerField()
    product_name = serializers.CharField()
    quantity_returned = serializers.IntegerField(min_value=1)
    image = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ReturnRequestSerializer(serializers.ModelSerializer):
    """Read serializer — used for both customer + admin responses."""

    order_number = serializers.CharField(source="order.order_number", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_name = serializers.SerializerMethodField()
    items = ReturnRequestItemSerializer(many=True, read_only=True)
    total_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = ReturnRequest
        fields = (
            "id",
            "order",
            "order_number",
            "user",
            "user_email",
            "user_name",
            "status",
            "reason",
            "admin_note",
            "items",
            "total_quantity",
            "created_at",
            "updated_at",
            "decided_at",
        )
        read_only_fields = (
            "order",
            "user",
            "status",
            "admin_note",
            "created_at",
            "updated_at",
            "decided_at",
        )

    def get_user_name(self, obj):
        u = obj.user
        full = (f"{u.first_name} {u.last_name}").strip()
        return full or u.username


class CreateReturnRequestSerializer(serializers.Serializer):
    """Customer-side payload for opening a return request."""

    reason = serializers.CharField(min_length=10, max_length=1000)
    # List of {"product_id": int, "quantity_returned": int}. We resolve the
    # product names + images server-side so the client doesn't have to
    # round-trip and the snapshot is always trustworthy.
    items = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False,
        max_length=50,
    )

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        for idx, row in enumerate(value):
            pid = row.get("product_id")
            qty = row.get("quantity_returned")
            if not isinstance(pid, int):
                raise serializers.ValidationError(
                    f"Item {idx}: product_id must be an integer."
                )
            if not isinstance(qty, int) or qty < 1:
                raise serializers.ValidationError(
                    f"Item {idx}: quantity_returned must be ≥ 1."
                )
        # Collapse duplicates (same product_id) by summing quantities.
        merged: dict[int, int] = {}
        for row in value:
            merged[row["product_id"]] = merged.get(row["product_id"], 0) + row[
                "quantity_returned"
            ]
        return [
            {"product_id": pid, "quantity_returned": qty}
            for pid, qty in merged.items()
        ]


class AdminReturnRequestPatchSerializer(serializers.Serializer):
    """Admin can only edit ``admin_note`` directly. Status transitions
    go through dedicated approve/reject/refund endpoints so the
    side-effects (notifications, stock restore) stay consistent."""

    admin_note = serializers.CharField(allow_blank=True, max_length=2000)