from django.conf import settings
from django.db import models


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
