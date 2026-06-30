"""Admin return-policy URL config (mounted at /api/admin/return-policies/)."""

from django.urls import path

from . import views


urlpatterns = [
    path("", views.admin_return_policy_list, name="list"),
    path("<int:pk>/", views.admin_return_policy_detail, name="detail"),
    path(
        "<int:pk>/toggle/",
        views.admin_return_policy_toggle,
        name="toggle",
    ),
]