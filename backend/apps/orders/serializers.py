from decimal import Decimal

from rest_framework import serializers

from apps.products.models import Product
from apps.products.serializers import ProductListSerializer

from .models import Cart, CartItem, Order, WishList


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
    city = serializers.CharField(max_length=80)
    state = serializers.CharField(max_length=80)
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