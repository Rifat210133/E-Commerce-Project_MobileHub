"""Admin return-request URL config (mounted at /api/admin/returns/)."""

from django.urls import path

from . import views

urlpatterns = [
    path("", views.admin_return_list, name="admin-return-list"),
    path(
        "<int:return_id>/",
        views.admin_return_detail,
        name="admin-return-detail",
    ),
    path(
        "<int:return_id>/approve/",
        views.admin_return_approve,
        name="admin-return-approve",
    ),
    path(
        "<int:return_id>/reject/",
        views.admin_return_reject,
        name="admin-return-reject",
    ),
    path(
        "<int:return_id>/refund/",
        views.admin_return_refund,
        name="admin-return-refund",
    ),
]