from django.urls import path

from . import views

urlpatterns = [
    path("comparison/", views.compare_list, name="comparison-list"),
    path("comparison/add/", views.compare_add, name="comparison-add"),
    path("comparison/remove/<int:product_id>/", views.compare_remove, name="comparison-remove"),
    path("comparison/clear/", views.compare_clear, name="comparison-clear"),
]
