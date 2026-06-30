"""Customer notification URL config (mounted at /api/notifications/)."""

from django.urls import path

from . import views


urlpatterns = [
    path("", views.customer_list_notifications, name="customer-list"),
    path(
        "read-all/",
        views.customer_mark_all_notifications_read,
        name="customer-mark-all-read",
    ),
    path(
        "<int:pk>/read/",
        views.customer_mark_notification_read,
        name="customer-mark-read",
    ),
]