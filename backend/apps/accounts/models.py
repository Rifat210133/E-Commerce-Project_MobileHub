from django.conf import settings
from django.db import models


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
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=60, blank=True, default="Bangladesh")
    # Older/legacy list of addresses — kept for back-compat.
    address_book = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Profile<{self.user.username}>"
