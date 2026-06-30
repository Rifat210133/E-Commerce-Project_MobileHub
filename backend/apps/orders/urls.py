from django.urls import path

from . import views

app_name = "orders"

urlpatterns = [
    # Cart
    path("cart/", views.cart_detail, name="cart-detail"),
    path("cart/add/", views.cart_add, name="cart-add"),
    path("cart/update/<int:item_id>/", views.cart_update, name="cart-update"),
    path("cart/remove/<int:item_id>/", views.cart_remove, name="cart-remove"),
    path("cart/clear/", views.cart_clear, name="cart-clear"),
    # Orders
    path("orders/checkout/", views.checkout, name="checkout"),
    path("orders/", views.order_list, name="order-list"),
    path("orders/<str:order_number>/", views.order_detail, name="order-detail"),
    # Wishlist
    path("wishlist/", views.wishlist_detail, name="wishlist-detail"),
    path("wishlist/add/<int:product_id>/", views.wishlist_add, name="wishlist-add"),
    path("wishlist/remove/<int:product_id>/", views.wishlist_remove, name="wishlist-remove"),
]
