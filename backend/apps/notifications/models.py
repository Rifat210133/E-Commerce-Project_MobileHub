from django.conf import settings
from django.db import models


class Notification(models.Model):
    """In-app notification surfaced inside the admin console.

    Designed primarily for admin/staff users: when an order is placed, the
    payment status changes, etc., an event row is written here so the
    dashboard can light up a bell badge and show a toast/drawer.
    """

    KIND_CHOICES = (
        ("order_placed", "Order placed"),
        ("order_paid", "Order paid"),
        ("order_status", "Order status changed"),
        ("low_stock", "Low stock alert"),
    )

    LEVEL_CHOICES = (
        ("info", "Info"),
        ("success", "Success"),
        ("warning", "Warning"),
        ("error", "Error"),
    )

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        # Recipients are admins/staff; regular users never see these rows.
    )
    kind = models.CharField(max_length=24, choices=KIND_CHOICES)
    level = models.CharField(max_length=16, choices=LEVEL_CHOICES, default="info")
    # Short headline shown in the bell/list ("New order #MH-12345").
    title = models.CharField(max_length=200)
    # Optional longer body shown in the drawer detail.
    body = models.TextField(blank=True)
    # Polymorphic-style link to the source row (e.g. an Order). Nullable so
    # the model stays generic — handlers stash whatever object they have.
    order = models.ForeignKey(
        "orders.Order",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="admin_notifications",
    )
    # JSON metadata bag so handlers can carry arbitrary payload (status,
    # payment method, totals) without growing the schema.
    meta = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("recipient", "-created_at")),
            models.Index(fields=("recipient", "is_read")),
        ]

    def __str__(self) -> str:
        return f"Notification<{self.kind} → {self.recipient_id}>"
