from django.contrib import admin

from .models import Cart, CartItem, Order, WishList


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("user", "updated_at")
    inlines = (CartItemInline,)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("order_number", "user", "status", "total_amount", "created_at")
    list_filter = ("status",)
    search_fields = ("order_number", "user__username", "user__email")


@admin.register(WishList)
class WishListAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at")