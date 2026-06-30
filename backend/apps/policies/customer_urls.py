"""Public return-policy URL config (mounted at /api/return-policies/)."""

from django.urls import path

from . import views


urlpatterns = [
    path("", views.public_return_policy_list, name="public-list"),
    path("<slug:slug>/", views.public_return_policy_detail, name="public-detail"),
]