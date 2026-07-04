"""
Top-level URL configuration.

All API endpoints live under /api/.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.products.urls")),
    path("api/", include("apps.orders.urls")),
    path("api/", include("apps.recommendations.urls")),
    path("api/", include("apps.comparison.urls")),
    path("api/admin/", include("apps.dashboard.urls")),
    path(
        "api/admin/notifications/",
        include("apps.notifications.admin_urls"),
    ),
    path(
        "api/notifications/",
        include("apps.notifications.customer_urls"),
    ),
    path(
        "api/admin/return-policies/",
        include("apps.policies.admin_urls"),
    ),
    path(
        "api/return-policies/",
        include("apps.policies.customer_urls"),
    ),
    path(
        "api/admin/returns/",
        include("apps.orders.admin_urls"),
    ),
    # Online payments (bKash / Nagad) — customer-facing endpoints.
    # The ``apps.payments.urls`` module exposes:
    #   POST /api/payments/<provider>/create/
    #   POST /api/payments/<provider>/execute/
    #   GET  /api/payments/<provider>/return/
    # for each registered provider (bkash, nagad).
    path("api/payments/", include("apps.payments.urls")),
    # Local payment-gateway simulator (bKash / Nagad sandboxes).
    # The simulator's provider adapters point at:
    #   BKASH_BASE_URL=http://127.0.0.1:<port>/sim/bkash
    #   NAGAD_BASE_URL=http://127.0.0.1:<port>/sim/nagad
    # and the hosted checkout pages live at /sim/<provider>/hosted/<id>/.
    # Mounted on the same hub project; just on a different port for the
    # "different origin" feel of the real gateways.
    path("sim/", include("apps.payments.simulator.urls")),
]  # end urlpatterns

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)