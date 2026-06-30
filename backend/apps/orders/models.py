from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.products.models import Product


class Cart(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Cart<{self.user.username}>"

    @property
    def subtotal(self) -> Decimal:
        return sum((item.subtotal for item in self.items.all()), Decimal("0.00"))

    @property
    def item_count(self) -> int:
        return sum(item.quantity for item in self.items.all())


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("cart", "product")
        ordering = ("-added_at",)

    def __str__(self) -> str:
        return f"{self.quantity} × {self.product.name}"

    @property
    def subtotal(self) -> Decimal:
        return self.product.price * self.quantity


class Order(models.Model):
    STATUS_CHOICES = (
        ("Pending", "Pending"),
        ("Confirmed", "Confirmed"),
        ("Processing", "Processing"),
        ("Shipped", "Shipped"),
        ("Delivered", "Delivered"),
        ("Cancelled", "Cancelled"),
    )

    order_number = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="orders"
    )
    items = models.JSONField(default=list)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="Pending")
    shipping_address = models.JSONField(default=dict, blank=True)
    estimated_arrival = models.DateField(null=True, blank=True)
    status_notes = models.TextField(blank=True)
    # Payment tracking: set automatically for online payments (card / paypal)
    # at checkout, and manually by admin for COD after cash is collected.
    # Orders without `paid_at` are excluded from revenue analytics.
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_via = models.CharField(max_length=20, blank=True, default="")
    # Set by the admin / order-status flow when the order transitions to
    # "Delivered". Used as the anchor for the return-policy window (so
    # deliveries don't have to immediately start the clock ticking from
    # checkout). Nullable so legacy / in-flight orders keep working.
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.order_number


class ReturnRequest(models.Model):
    """A customer-initiated return request for one or more items in an order.

    A request can cover a subset of an order's items, with per-line
    ``quantity_returned`` so partial returns work. The full order is the
    parent so we can render the request in the order-detail page and so
    the return window can be measured from the order's ``delivered_at``.

    ``items`` is a JSONField of::

        [{"product_id": 12, "product_name": "iPhone 15", "quantity_returned": 1}, ...]

    We snapshot the product name so the request still makes sense if the
    product is later renamed or deactivated. Stock is restored on
    ``Approved`` transition (handled in the view layer; the model itself
    is plain storage).
    """

    STATUS_REQUESTED = "Requested"
    STATUS_APPROVED = "Approved"
    STATUS_REJECTED = "Rejected"
    STATUS_REFUNDED = "Refunded"
    STATUS_CANCELLED = "Cancelled"
    STATUS_CHOICES = (
        (STATUS_REQUESTED, "Requested"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_REFUNDED, "Refunded"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="return_requests"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="return_requests",
    )
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_REQUESTED
    )
    # Free-text from the customer. Required, min 10 chars (enforced in
    # the serializer).
    reason = models.TextField(blank=True)
    # Admin-side note (refund amount, tracking #, etc.). Editable only
    # via the admin endpoints.
    admin_note = models.TextField(blank=True)
    # List of {"product_id": int, "product_name": str,
    #          "quantity_returned": int, "image": str|None}
    items = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["order", "status"]),
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Return<{self.order.order_number} · {self.status}>"

    @property
    def total_quantity(self) -> int:
        return sum(
            int(i.get("quantity_returned", 0) or 0) for i in (self.items or [])
        )


class WishList(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist"
    )
    products = models.ManyToManyField(Product, blank=True, related_name="wishlisted_by")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Wishlist<{self.user.username}>"