"""Payment model: a per-attempt log keyed on the provider's ``paymentID``.

Why a separate table from ``Order``:
* idempotency — the customer can double-click "Pay". A second ``create``
  call sees the existing attempt and re-uses the same ``paymentID``,
  preventing two parallel payment sessions in the provider.
* audit — the provider's last-known status + raw response is preserved
  even after the order is paid, so refunds / disputes can be replayed.
* multi-provider — bKash and Nagad each keep their own attempts under a
  unique ``paymentID``; the Order links to whichever attempt paid it.

Status values mirror bKash / Nagad terminology (``Initiated``,
``Executed``, ``Failed``) and add an internal ``Paid`` once the order
is marked ``paid_at`` — the webhook / return path moves attempts forward
in this order:

    Initiated → (provider approves) → Executed → (server flips order) → Paid
                                  \\-> Failed (terminal)
"""
from django.db import models

from apps.orders.models import Order


class PaymentAttempt(models.Model):
    STATUS_CHOICES = (
        ("Initiated", "Initiated"),
        ("Executed", "Executed"),
        ("Paid", "Paid"),
        ("Failed", "Failed"),
        ("Cancelled", "Cancelled"),
    )
    PROVIDER_CHOICES = (
        ("bkash", "bKash"),
        ("nagad", "Nagad"),
    )

    # Provider-issued ID. bKash calls this ``paymentID``; Nagad the same.
    payment_id = models.CharField(max_length=80, unique=True)
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="payment_attempts"
    )
    provider = models.CharField(max_length=16, choices=PROVIDER_CHOICES)
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default="Initiated"
    )
    # The provider's full response so the admin can replay it on a dispute.
    # Kept as JSONField (not TextField) so debugging tools / the admin can
    # read it directly without parsing strings.
    raw_response = models.JSONField(default=dict, blank=True)
    # bKash bkashURL / Nagad challenge URL where the user completes payment.
    redirect_url = models.URLField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            # The poller hits ``order -> latest attempt`` constantly.
            models.Index(fields=["order", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.payment_id} ({self.status})"

    @property
    def is_terminal(self) -> bool:
        """A terminal attempt won't change status again."""
        return self.status in {"Paid", "Failed", "Cancelled"}