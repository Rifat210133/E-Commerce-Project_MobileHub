from django.contrib import admin

from .models import CompareList


@admin.register(CompareList)
class CompareListAdmin(admin.ModelAdmin):
    list_display = ("user", "count", "updated_at")
    filter_horizontal = ("products",)
    search_fields = ("user__username", "user__email")
