from django.urls import path

from . import views

app_name = "dashboard"

urlpatterns = [
    # Analytics
    path("analytics/overview/", views.analytics_overview, name="analytics-overview"),
    path("analytics/sales/", views.analytics_sales, name="analytics-sales"),
    path("analytics/distribution/", views.analytics_distribution, name="analytics-distribution"),
    # Orders
    path("orders/", views.admin_orders, name="admin-orders"),
    path("orders/<int:order_id>/", views.admin_order_status, name="admin-order-detail"),
    path("orders/<int:order_id>/status/", views.admin_order_status, name="admin-order-status"),
    path(
        "orders/<int:order_id>/mark-paid/",
        views.admin_mark_order_paid,
        name="admin-order-mark-paid",
    ),
    # Customers
    path("customers/", views.admin_customers, name="admin-customers"),
    # Products CRUD
    path("products/", views.admin_products, name="admin-products"),
    path("products/<int:pk>/", views.admin_product_detail, name="admin-product-detail"),
    # Inventory
    path("inventory/", views.inventory_list, name="inventory-list"),
    path("inventory/<int:pk>/stock/", views.inventory_update_stock, name="inventory-stock"),
    path("inventory/alerts/", views.inventory_alerts, name="inventory-alerts"),
    # Hero feature (singleton)
    path("hero/", views.admin_hero_feature, name="admin-hero-feature"),
]