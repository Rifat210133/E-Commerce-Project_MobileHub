"""URL routing for the payments app.

Three endpoints per provider, namespaced so the FE can call:
- reverse('payments:bkash_create') or just hit ``/api/payments/bkash/create/``

The provider segment is a path converter so adding a new provider is
just a matter of registering it in ``views._PROVIDERS``.
"""
from django.urls import path

from . import views

urlpatterns = [
    # bKash
    path("bkash/create/", views.payment_create, {"provider": "bkash"}, name="bkash_create"),
    path("bkash/execute/", views.payment_execute, {"provider": "bkash"}, name="bkash_execute"),
    path("bkash/return/", views.payment_return, {"provider": "bkash"}, name="bkash_return"),
    # Nagad
    path("nagad/create/", views.payment_create, {"provider": "nagad"}, name="nagad_create"),
    path("nagad/execute/", views.payment_execute, {"provider": "nagad"}, name="nagad_execute"),
    path("nagad/return/", views.payment_return, {"provider": "nagad"}, name="nagad_return"),
] + [
    # Generic provider-agnostic entry points (less likely to be used by
    # the FE today, but they make the API self-documenting in DRF browsable)
    path("<str:provider>/create/", views.payment_create, name="payment_create"),
    path("<str:provider>/execute/", views.payment_execute, name="payment_execute"),
    path("<str:provider>/return/", views.payment_return, name="payment_return"),
]
