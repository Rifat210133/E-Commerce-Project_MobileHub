"""Admin notification URL config (mounted at /api/admin/notifications/)."""

from django.urls import path

from . import views


urlpatterns = [
    path("", views.list_notifications, name="list"),
    path("read-all/", views.mark_all_read, name="mark-all-read"),
    path(
        "<int:pk>/read/",
        views.mark_notification_read,
        name="mark-read",
    ),
]
