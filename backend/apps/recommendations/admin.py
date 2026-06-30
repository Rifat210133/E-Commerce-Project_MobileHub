from django.contrib import admin

from .models import YouTubeCache


@admin.register(YouTubeCache)
class YouTubeCacheAdmin(admin.ModelAdmin):
    list_display = ("query", "cached_at")
    search_fields = ("query",)