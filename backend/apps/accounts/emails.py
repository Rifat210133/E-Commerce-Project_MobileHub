"""Helpers for rendering password-reset emails.

We send both plain-text and HTML so the link is easy to tap on any client.
The reset link points at the SPA route, not the API directly, so the user
sees a styled reset page in their browser.
"""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode


def build_reset_link(request, user) -> str:
    """Build the absolute URL the user clicks to land on the reset page."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)

    spa_base = getattr(settings, "FRONTEND_BASE_URL", "http://127.0.0.1:5173")
    return f"{spa_base.rstrip('/')}/reset-password/{uid}/{token}/"


def send_password_reset_email(request, user) -> None:
    """Render and send the password-reset email to ``user``."""
    reset_url = build_reset_link(request, user)

    context = {
        "user": user,
        "reset_url": reset_url,
        "site_name": "MobileHub",
        "expiry_hours": 24,
    }

    subject = "Reset your MobileHub password"
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@mobilehub.local")
    to_email = [user.email]

    text_body = render_to_string("accounts/password_reset_email.txt", context)
    html_body = render_to_string("accounts/password_reset_email.html", context)

    message = EmailMultiAlternatives(subject, text_body, from_email, to_email)
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)
