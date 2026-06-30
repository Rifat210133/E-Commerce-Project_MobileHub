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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.order_number


class WishList(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist"
    )
    products = models.ManyToManyField(Product, blank=True, related_name="wishlisted_by")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Wishlist<{self.user.username}>"