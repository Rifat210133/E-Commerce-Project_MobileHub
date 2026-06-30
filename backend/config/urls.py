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
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)