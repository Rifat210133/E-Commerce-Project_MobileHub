"""Payment model: a per-attempt log keyed on the provider's ``paymentID``.

Why a separate table from ``Order``:
* idempotency — the customer can double-click "Pay". A second ``create``
  call sees the existing attempt and re-uses the same ``paymentID``,
  preventing two parallel payment sessions in the provider.
* audit — the provider's last-known status + raw response is preserved
  even after the order is paid, so refunds / disputes can be replayed.
* multi-provider — bKash and Nagad each keep their own attempts under a
  unique ``paymentID``; the Order links to whichever attempt paid it.

Deferred Order creation
-----------------------
For online methods (bKash / Nagad) we do NOT create an ``Order`` row at
checkout time — see ``apps.orders.views.checkout``. Instead the
``PaymentAttempt`` snapshots everything we'd normally store on an Order
(cart-line items, shipping address, totals, payment method) so that
``payment_execute`` can materialize the Order only once the gateway
actually confirms the payment. ``order`` therefore starts out NULL
(``on_delete=SET_NULL``) and is filled in on the Paid transition.

The snapshot fields are redundant after the Order is created — we keep
them anyway so abandoned / Failed attempts can still be inspected from
the admin without re-joining a (possibly never-created) Order.

Status values mirror bKash / Nagad terminology (``Initiated``,
``Executed``, ``Failed``) and add an internal ``Paid`` once the order
is marked ``paid_at`` — the webhook / return path moves attempts forward
in this order:

    Initiated → (provider approves) → Executed → (server flips order) → Paid
                                  \\-> Failed (terminal)
"""
from django.conf import settings
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
    # Nullable so a draft attempt can exist before payment is confirmed.
    # SET_NULL (rather than CASCADE) preserves the audit row if the
    # associated Order is ever deleted out from under us — the attempt's
    # snapshot fields still carry enough info to reconstruct what was
    # sold.
    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_attempts",
    )
    # The user the attempt belongs to. We store it (rather than
    # back-resolving via Order) because the Order may not exist yet.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payment_attempts",
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

    # ----- snapshot fields (mirror Order; used until execute() materializes one) -----
    # A unique generated identifier we hand to the provider in lieu of a
    # real Order.order_number (which doesn't exist yet). E.g. "MH-D12345".
    draft_number = models.CharField(max_length=20, unique=True)
    # Total to charge the provider, stored as a string the way the
    # provider wants it (no rounding surprises).
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    # The customer's chosen payment method (mirrors what the Order will
    # eventually hold — also drives the admin's "paid via" filter).
    payment_method = models.CharField(max_length=20, blank=True, default="")
    # Snapshot of the cart at checkout. Same shape as Order.items so we
    # can hand it straight to Order.objects.create(items=...) when
    # execute() confirms.
    items = models.JSONField(default=list, blank=True)
    # Snapshot of the shipping address (incl. our payment_method /
    # subtotal / tax block in shipping_address).
    shipping_address = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            # The poller hits ``order -> latest attempt`` constantly.
            models.Index(fields=["order", "-created_at"]),
            # Cleanup / dashboard / status-by-user queries.
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["provider", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.payment_id} ({self.status})"

    @property
    def is_terminal(self) -> bool:
        """A terminal attempt won't change status again."""
        return self.status in {"Paid", "Failed", "Cancelled"}

    @property
    def has_order(self) -> bool:
        """True once execute() has materialized the snapshot into an Order."""
        return self.order_id is not None

    def as_provider_stub(self):
        """Return a tiny ``Order``-shaped object the provider can read.

        bKash / Nagad only touch ``order.user.username`` and
        ``order.order_number`` during create(); see
        ``apps/payments/providers.py``. We don't want to fabricate a real
        Order (it's the user's promise to pay that creates one), so we
        hand off an adapter that quacks like one.
        """
        attempt = self

        class _StubUser:
            @property
            def username(self):
                return attempt.user.username

        class _StubOrder:
            user = _StubUser()
            order_number = attempt.draft_number

        return _StubOrder()


def generate_draft_number() -> str:
    """Return a unique placeholder number used before an Order exists.

    Prefix ``MH-D`` makes these obvious in logs / admin — keeps the real
    ``MH-`` namespace reserved for actual Orders.
    """
    import random

    while True:
        number = f"MH-D{random.randint(10000, 99999)}"
        if not PaymentAttempt.objects.filter(draft_number=number).exists():
            return number