"""Serializers for ReturnPolicy.

Two flavors:

* ``ReturnPolicySerializer`` — admin-facing, full payload including the
  metadata fields (window, fee, etc.). Used for list/create/update.
* ``ReturnPolicyPublicSerializer`` — customer-facing, only fields safe to
  render in the storefront. The body is split into paragraphs server-side
  so the frontend can render each in its own ``<p>`` without doing string
  splitting itself.
"""
from rest_framework import serializers

from .models import ReturnPolicy


class ReturnPolicySerializer(serializers.ModelSerializer):
    """Full admin payload."""

    class Meta:
        model = ReturnPolicy
        fields = [
            "id",
            "slug",
            "title",
            "summary",
            "body",
            "return_window_days",
            "requires_receipt",
            "restocking_fee_percent",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]


    def validate_title(self, value):
        v = (value or "").strip()
        if not v:
            raise serializers.ValidationError("Title is required.")
        if len(v) > 120:
            raise serializers.ValidationError("Title is too long (max 120 chars).")
        return v

    def validate_summary(self, value):
        v = (value or "").strip()
        return v[:255]

    def validate_body(self, value):
        # Trim trailing whitespace but keep interior blank lines so paragraph
        # breaks survive the round-trip.
        return (value or "").strip()

    def validate_return_window_days(self, value):
        if value < 0 or value > 365:
            raise serializers.ValidationError("Window must be 0–365 days.")
        return value

    def validate_restocking_fee_percent(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Restocking fee must be 0–100%.")
        return value


class ReturnPolicyPublicSerializer(serializers.ModelSerializer):
    """Customer-facing payload. Body is pre-split into paragraphs."""

    paragraphs = serializers.SerializerMethodField()

    class Meta:
        model = ReturnPolicy
        fields = [
            "slug",
            "title",
            "summary",
            "return_window_days",
            "requires_receipt",
            "restocking_fee_percent",
            "paragraphs",
            "updated_at",
        ]

    def get_paragraphs(self, obj):
        # Two or more newlines = paragraph break. Single newlines collapse to
        # spaces so admins don't have to perfectly format long lines.
        text = (obj.body or "").strip()
        if not text:
            return []
        blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
        out = []
        for b in blocks:
            # Collapse internal newlines into spaces (single-line wraps).
            out.append(" ".join(line.strip() for line in b.splitlines() if line.strip()))
        return out