from django.conf import settings
from django.db import models
from decimal import Decimal


def compute_tier_from_spend(total_paid: Decimal) -> str:
    """Map a customer's cumulative paid spend to a tier label.

    Tiers are inclusive at the lower bound and stack — once a customer
    hits ৳25,000 they stay ``Gold`` even on later smaller orders, until
    they cross into ``Platinum`` at ৳75,000. ``Standard`` covers anyone
    who's registered but hasn't paid for anything yet.

    The bands are intentionally simple and BD-currency-friendly (৳). If
    product/marketing want to change the bands later this is the one
    function to edit.
    """
    if total_paid >= Decimal("75000"):
        return "Platinum"
    if total_paid >= Decimal("25000"):
        return "Gold"
    return "Standard"


class EmailOTP(models.Model):
    """One-time code sent to an email address for verification.

    Used today for the registration flow: a user enters an email, we email
    them a 6-digit code, and they must present the code again to complete
    registration. We only ever store a SHA-256 hash of the code so a database
    leak doesn't reveal usable OTPs.

    Rows are scoped by ``purpose`` so the same table can later host
    password-reset OTPs, login OTPs, etc., without cross-talk.
    """

    PURPOSE_REGISTER = "register"
    PURPOSE_CHOICES = (
        (PURPOSE_REGISTER, "Registration"),
    )

    email = models.EmailField(db_index=True)
    purpose = models.CharField(max_length=32, choices=PURPOSE_CHOICES, default=PURPOSE_REGISTER)
    # SHA-256 hex digest of the 6-digit code. 64 chars.
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["email", "purpose"]),
            models.Index(fields=["expires_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:  # pragma: no cover
        return f"EmailOTP<{self.email} / {self.purpose}>"

    @property
    def is_expired(self) -> bool:
        from django.utils import timezone
        return timezone.now() >= self.expires_at

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None


class UserProfile(models.Model):
    """Extends the built-in User with MobileHub-specific profile data."""

    MEMBERSHIP_CHOICES = (
        ("Standard", "Standard"),
        ("Elite", "Elite"),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    phone_number = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    membership_tier = models.CharField(
        max_length=16, choices=MEMBERSHIP_CHOICES, default="Standard"
    )
    # Primary/default address — flat fields so the profile form can bind directly.
    address_line1 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=80, blank=True)
    state = models.CharField(max_length=80, blank=True)
    # Bangladesh admin areas: division → district → upazila (3 cascading
    # dropdowns in the UI). Stored alongside the legacy `state`/`city` text
    # fields so any old free-text values are preserved on user profiles.
    division = models.CharField(max_length=60, blank=True)
    district = models.CharField(max_length=80, blank=True)
    upazila = models.CharField(max_length=80, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=60, blank=True, default="Bangladesh")
    # Older/legacy list of addresses — kept for back-compat.
    address_book = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Profile<{self.user.username}>"

    @property
    def computed_tier(self) -> str:
        """Live tier computed from the user's lifetime paid order spend.

        We sum ``Order.total_amount`` across orders that actually got paid
        (``paid_at`` is set, regardless of fulfilment status) and bucket
        that spend. Orders that were cancelled or never paid are skipped.

        This overrides the value stored in ``membership_tier`` — the DB
        field is kept for backwards-compat (and so admin overrides can
        still pin a specific user to a tier) but the API surfaces the
        live computed value by default.
        """
        from apps.orders.models import Order
        from django.db.models import Sum

        total = (
            Order.objects.filter(user=self.user, paid_at__isnull=False)
            .aggregate(s=Sum("total_amount"))
            .get("s")
        )
        return compute_tier_from_spend(total or Decimal("0"))
