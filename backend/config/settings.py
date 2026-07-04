"""
Django settings for the MobileHub backend.

Production deployment should override the .env values with proper secrets
and switch USE_SQLITE=False (with DATABASE_URL set to PostgreSQL).
"""

from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Core ---------------------------------------------------------------------
SECRET_KEY = config("SECRET_KEY", default="dev-insecure-secret-key")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# Absolute origin of the MobileHub backend / API. The bKash / Nagad
# simulator (apps/payments/simulator) runs on a separate port and uses
# this to redirect customers back to the correct app origin after a
# hosted-page approval — a relative URL like "/orders/<n>" would
# resolve against the simulator's origin and hit the simulator's own
# 404 page. Set HUB_BASE_URL in .env to your public origin in production
# (e.g. https://hub.example.com).
HUB_BASE_URL = config("HUB_BASE_URL", default="http://127.0.0.1:8000")

# --- Apps ---------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    # local
    "apps.accounts",
    "apps.products",
    "apps.orders",
    "apps.recommendations",
    "apps.dashboard",
    "apps.comparison",
    "apps.notifications",
    "apps.policies",
    "apps.payments",
    "apps.payments.simulator",
]  # end INSTALLED_APPS

# --- App init -----------------------------------------------------------------
import logging

_logger = logging.getLogger("mobilehub.config")

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --- Database -----------------------------------------------------------------
USE_SQLITE = config("USE_SQLITE", default=True, cast=bool)
if USE_SQLITE:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("DB_NAME", default="mobilehub"),
            "USER": config("DB_USER", default="mobilehub_user"),
            "PASSWORD": config("DB_PASSWORD", default=""),
            "HOST": config("DB_HOST", default="localhost"),
            "PORT": config("DB_PORT", default="5432"),
        }
    }

# --- Auth ---------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- I18N ---------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static / Media -----------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- DRF ----------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.AllowAny",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_RATES": {
        # Anti-abuse cap on how often an anonymous user can request a
        # registration OTP. 5 per hour per IP keeps the door open without
        # letting anyone mail-bomb arbitrary addresses via us.
        "register-otp": "5/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# --- CORS ---------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://127.0.0.1:5173",
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True

# --- MobileHub ----------------------------------------------------------------
YOUTUBE_API_KEY = config("YOUTUBE_API_KEY", default="")

# --- Frontend / SPA -----------------------------------------------------------
# Used by the password-reset email so the link opens our SPA reset page, not
# the Django admin password-reset template.
FRONTEND_BASE_URL = config(
    "FRONTEND_BASE_URL", default="http://127.0.0.1:5173"
)

# --- Email --------------------------------------------------------------------
# Set EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend and fill in
# EMAIL_HOST_USER + EMAIL_HOST_PASSWORD with a Gmail account + *App Password*
# (https://myaccount.google.com/apppasswords — account passwords don't work).
# If SMTP isn't configured, we fall back to the console backend so the reset
# link is printed to the runserver log instead of going to a real inbox.
_raw_email_backend = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
# Accept a friendly alias "gmail" — it's the most common case.
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if _raw_email_backend.lower() == "gmail"
    else _raw_email_backend
)
EMAIL_HOST = config("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL",
    default=EMAIL_HOST_USER or "no-reply@mobilehub.local",
)

# --- Email sanity check ------------------------------------------------------
# Surface a loud, actionable warning at startup if SMTP is selected but
# credentials are missing. This is the most common cause of "the email just
# doesn't arrive" reports, and otherwise it fails silently in the request
# handler.
if (
    "smtp" in EMAIL_BACKEND.lower()
    and not (EMAIL_HOST_USER and EMAIL_HOST_PASSWORD)
):
    _logger.warning(
        "EMAIL_BACKEND=%s but EMAIL_HOST_USER/EMAIL_HOST_PASSWORD are not set. "
        "Password-reset emails will fail to send. Add them to backend/.env "
        "(use a Gmail *App Password* — https://myaccount.google.com/apppasswords).",
        EMAIL_BACKEND,
    )

# --- Payments -----------------------------------------------------------------
# bKash / Nagad payment gateway configuration.
#
# Settings:
#   FEATURE_PAYMENT_METHODS  - comma-separated list of provider codes the
#                              customer-facing checkout will accept. Default
#                              enables both.
#   BKASH_BASE_URL / NAGAD_BASE_URL
#                            - the gateway origin + mount path. For local dev
#                              these point at the simulator on :8001; for
#                              real sandboxes use https://tokenized.pay.bka.sh
#                              and https://api.mynagad.com respectively.
#   BKASH_USERNAME / BKASH_PASSWORD / BKASH_APP_KEY / BKASH_APP_SECRET
#   NAGAD_MERCHANT_ID / NAGAD_MERCHANT_KEY
#                            - sandbox credentials. bKash's sandbox values are
#                              public; Nagad publishes test merchant creds
#                              too. Override in .env for production.
#   PUBLIC_BASE_URL          - the absolute origin the gateway should
#                              callback into. Same value as HUB_BASE_URL in
#                              development, since the simulator treats them
#                              as one origin.
FEATURE_PAYMENT_METHODS = config(
    "FEATURE_PAYMENT_METHODS",
    default="bkash,nagad",
    cast=Csv(),
)
PUBLIC_BASE_URL = config(
    "PUBLIC_BASE_URL",
    default=HUB_BASE_URL,
)
BKASH = {
    "BASE_URL": config(
        "BKASH_BASE_URL",
        default="https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout",
    ),
    "USERNAME": config("BKASH_USERNAME", default="sandboxUsername"),
    "PASSWORD": config("BKASH_PASSWORD", default="sandboxPassword"),
    "APP_KEY": config("BKASH_APP_KEY", default="sandboxAppKey"),
    "APP_SECRET": config("BKASH_APP_SECRET", default="sandboxAppSecret"),
}
NAGAD = {
    "BASE_URL": config(
        "NAGAD_BASE_URL",
        default="https://api.mynagad.com",
    ),
    "MERCHANT_ID": config("NAGAD_MERCHANT_ID", default="sandboxMerchantId"),
    "MERCHANT_KEY": config("NAGAD_MERCHANT_KEY", default="sandboxMerchantKey"),
    "MERCHANT_PRIVATE_KEY": config("NAGAD_MERCHANT_PRIVATE_KEY", default=""),
    "MERCHANT_PUBLIC_KEY": config("NAGAD_MERCHANT_PUBLIC_KEY", default=""),
}