"""URL patterns for the bKash / Nagad simulator.

Mounted at ``/sim/`` from ``config/urls.py``.

Wire-protocol routes (``token/grant``, ``payment/create``, etc.) are mounted
at the same paths the provider builds by appending to ``BASE_URL``. So the
BASE_URL just needs to be ``http://127.0.0.1:8001/sim/bkash`` for bKash and
``http://127.0.0.1:8001/sim/nagad`` for Nagad — exactly the shape of the
real provider URLs minus the host.

The customer-facing hosted page is also mounted here (out-of-band — not
part of the bKash / Nagad API surface).

No auth, no CSRF — anyone who can reach the process can simulate a
payment. The real bKash / Nagad servers are public too, so the security
model matches.
"""
from django.urls import path

from . import views


app_name = "payments_simulator"

urlpatterns = [
    # --- bKash wire protocol ---
    # Mirrors https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/...
    path("bkash/tokenized/checkout/token/grant", views.bkash_token_grant, name="bkash_token_grant"),
    path("bkash/tokenized/checkout/payment/create", views.bkash_payment_create, name="bkash_payment_create"),
    path(
        "bkash/tokenized/checkout/payment/execute/<str:payment_id>",
        views.bkash_payment_execute,
        name="bkash_payment_execute",
    ),
    # --- Hosted page (customer-facing HTML; lives outside the wire prefix
    # because it isn't part of the bKash API surface) ---
    path("bkash/hosted/<str:payment_id>/", views.bkash_hosted, name="bkash_hosted"),
    path(
        "bkash/hosted/<str:payment_id>/submit/",
        views.bkash_hosted_submit,
        name="bkash_submit",
    ),
    path(
        "bkash/hosted/<str:payment_id>/cancel/",
        views.bkash_hosted_cancel,
        name="bkash_cancel",
    ),
    # --- Nagad wire protocol ---
    # Mirrors https://api.mynagad.com/remote-payment-gateway-1.0/check-out/...
    path(
        "nagad/remote-payment-gateway-1.0/check-out/initialize/<str:merchant_id>/<str:order_id>",
        views.nagad_initialize,
        name="nagad_initialize",
    ),
    path(
        "nagad/remote-payment-gateway-1.0/check-out/complete/<str:payment_ref>",
        views.nagad_complete,
        name="nagad_complete",
    ),
    path(
        "nagad/remote-payment-gateway-1.0/check-out/verify/<str:payment_ref>",
        views.nagad_verify,
        name="nagad_verify",
    ),
    # --- Hosted page ---
    path("nagad/hosted/<str:payment_id>/", views.nagad_hosted, name="nagad_hosted"),
    path(
        "nagad/hosted/<str:payment_id>/submit/",
        views.nagad_hosted_submit,
        name="nagad_submit",
    ),
    path(
        "nagad/hosted/<str:payment_id>/cancel/",
        views.nagad_hosted_cancel,
        name="nagad_cancel",
    ),
]
