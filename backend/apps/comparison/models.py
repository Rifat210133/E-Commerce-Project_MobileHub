from django.conf import settings
from django.db import models

from apps.products.models import Product


class CompareList(models.Model):
    """A user's side-by-side comparison list (up to 4 products)."""

    MAX_ITEMS = 4

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="compare_list",
    )
    products = models.ManyToManyField(
        Product, blank=True, related_name="compared_by"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"CompareList<{self.user.username}>"

    @property
    def count(self) -> int:
        return self.products.count()

    def is_full(self) -> bool:
        return self.products.count() >= self.MAX_ITEMS
