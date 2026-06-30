"""Models for storefront policies.

The current scope is return policies: a small CMS so admins can author the
policy text shown to customers. We keep the data model generic (slug,
title, summary, body, is_active, return-window metadata) so future
policies (shipping, warranty, etc.) can reuse the same tables without
introducing a parallel app per policy type.

For now the admin can have multiple rows, but the customer-facing endpoint
returns only the rows where ``is_active=True``. We don't enforce a
single-active-row rule in the DB because a future "regional" policy might
need to coexist with a global default.
"""
from django.db import models
from django.utils.text import slugify


class ReturnPolicy(models.Model):
    """A single return-policy document.

    ``body`` is stored as plain text with optional blank-line-separated
    paragraphs. The frontend renders paragraph breaks; we don't pull in a
    markdown renderer for this MVP to keep the page rendering dependency-
    free. If we ever need rich text, swap ``body`` to ``MarkdownField``
    from django-markdownify or similar.
    """

    slug = models.SlugField(
        max_length=80,
        unique=True,
        help_text="URL identifier; auto-generated from title if left blank.",
    )
    title = models.CharField(max_length=120)
    summary = models.CharField(
        max_length=255,
        blank=True,
        help_text="One-sentence elevator pitch shown above the body.",
    )
    body = models.TextField(
        blank=True,
        help_text=(
            "Policy body. Blank lines become paragraph breaks; the page "
            "renders each block separately."
        ),
    )
    # Customer-facing metadata so we don't have to bolt it onto the body.
    return_window_days = models.PositiveSmallIntegerField(
        default=14,
        help_text="How many days from delivery customers can open a return.",
    )
    requires_receipt = models.BooleanField(
        default=True,
        help_text="If true, customers must include a receipt or order number.",
    )
    restocking_fee_percent = models.PositiveSmallIntegerField(
        default=0,
        help_text="Percent of the order value retained as a restocking fee.",
    )

    is_active = models.BooleanField(
        default=True,
        help_text=(
            "When off, the policy is hidden from the customer endpoint "
            "but still appears in the admin list."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_active", "-updated_at"]
        indexes = [
            models.Index(fields=["is_active", "-updated_at"]),
        ]

    def __str__(self):
        return f"{self.title}{'' if self.is_active else ' (inactive)'}"

    def save(self, *args, **kwargs):
        # Auto-slug when the admin leaves the field blank. We don't want to
        # overwrite an explicit slug on every save — only when it's empty.
        if not self.slug:
            base = slugify(self.title) or "policy"
            slug = base
            i = 2
            while ReturnPolicy.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{i}"
                i += 1
            self.slug = slug
        super().save(*args, **kwargs)