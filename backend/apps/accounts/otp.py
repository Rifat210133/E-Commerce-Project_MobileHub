"""Helpers for creating, storing, and verifying email OTPs.

We do all OTP work through this module so the serializer/view code stays
slim. The hash + brute-force defense logic lives here in one place.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import EmailOTP


OTP_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
CODE_LEN = 6


def _hash(code: str) -> str:
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def generate_code() -> str:
    """Return a fresh numeric code as a string (zero-padded)."""
    # 6-digit decimal. secrets.randbelow gives uniform distribution.
    n = secrets.randbelow(10**CODE_LEN)
    return f"{n:0{CODE_LEN}d}"


def _send_email(email: str, code: str) -> tuple[bool, str | None]:
    """Best-effort delivery. Returns (sent, debug_error)."""
    from .emails import send_registration_otp_email

    try:
        send_registration_otp_email(email, code)
        return True, None
    except Exception as exc:  # pragma: no cover - SMTP errors
        if getattr(settings, "DEBUG", False):
            return False, (
                f"{exc.__class__.__name__}: {exc}"
            )
        return False, None


def issue_register_otp(email: str) -> dict:
    """Issue a registration OTP for ``email``.

    Always invalidates any previous un-used OTP for the same (email,purpose)
    pair and sends a fresh one. The caller never learns whether the email
    is already in use — we always return a uniform success response.

    Returns a dict with ``sent`` and (in DEBUG) ``debug_error`` and ``code``.
    The ``code`` is only included when ``settings.DEBUG`` is True so a
    developer running the console email backend can read the code without
    checking the terminal.
    """
    from .models import EmailOTP as _EOTP  # local for typing

    email_l = email.strip().lower()

    # Invalidate prior un-consumed rows so only the latest code counts.
    _EOTP.objects.filter(
        email=email_l,
        purpose=_EOTP.PURPOSE_REGISTER,
        consumed_at__isnull=True,
    ).update(consumed_at=timezone.now())

    code = generate_code()
    code_hash = _hash(code)
    expires_at = timezone.now() + OTP_TTL

    sent, debug_error = _send_email(email_l, code)

    # We always *persist* a row so the verify path can count attempts and
    # detect expired codes consistently — even when the send fails in DEBUG.
    _EOTP.objects.create(
        email=email_l,
        purpose=_EOTP.PURPOSE_REGISTER,
        code_hash=code_hash,
        expires_at=expires_at,
    )

    out = {"sent": sent}
    if getattr(settings, "DEBUG", False):
        out["code"] = code  # dev convenience
        out["debug_error"] = debug_error
    return out


def consume_register_otp(email: str, code: str) -> tuple[bool, str | None]:
    """Verify and *consume* the OTP. Returns (ok, debug_reason).

    - ok=True: the OTP matched, was not expired, was not already used, and
      is now marked consumed.
    - ok=False: any failure — invalid code, expired, already used, too many
      attempts. The message is intentionally generic so the API surface
      can't be used for email enumeration.
    """
    from .models import EmailOTP as _EOTP  # local for typing

    email_l = email.strip().lower()
    code_hash = _hash(code)

    # We pull the *latest* un-consumed matching row to compare against. If a
    # newer OTP was issued, this older one is treated as invalid.
    otp = (
        _EOTP.objects.filter(
            email=email_l,
            purpose=_EOTP.PURPOSE_REGISTER,
        )
        .order_by("-created_at")
        .first()
    )

    debug_reason: str | None = None

    if not otp:
        if getattr(settings, "DEBUG", False):
            debug_reason = "no_otp_for_email"
        return False, debug_reason

    # Increment attempts first so the DB-level counter is always right even
    # on race conditions.
    _EOTP.objects.filter(pk=otp.pk).update(attempts=otp.attempts + 1)
    otp.refresh_from_db(fields=["attempts"])

    if otp.is_consumed:
        if getattr(settings, "DEBUG", False):
            debug_reason = "already_consumed"
        return False, debug_reason

    if otp.is_expired:
        if getattr(settings, "DEBUG", False):
            debug_reason = "expired"
        return False, debug_reason

    if otp.attempts > MAX_ATTEMPTS:
        if getattr(settings, "DEBUG", False):
            debug_reason = "too_many_attempts"
        return False, debug_reason

    if otp.code_hash != code_hash:
        if getattr(settings, "DEBUG", False):
            debug_reason = "code_mismatch"
        return False, debug_reason

    # Success — consume atomically.
    _EOTP.objects.filter(pk=otp.pk, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    return True, None
