"""Custom filter for the /api/products/ endpoint."""
from django.db.models import Q
from django_filters import rest_framework as filters

from .models import Product


class ProductFilter(filters.FilterSet):
    # ----- General -----
    brand = filters.CharFilter(field_name="brand__slug", lookup_expr="iexact")
    q = filters.CharFilter(method="filter_search")
    in_stock = filters.BooleanFilter(method="filter_in_stock")
    is_featured = filters.BooleanFilter(field_name="is_featured")
    is_new_arrival = filters.BooleanFilter(field_name="is_new_arrival")

    # ----- Pricing -----
    price_min = filters.NumberFilter(field_name="price", lookup_expr="gte")
    price_max = filters.NumberFilter(field_name="price", lookup_expr="lte")

    # ----- Memory -----
    ram = filters.NumberFilter(field_name="spec__ram_gb", lookup_expr="exact")
    ram_min = filters.NumberFilter(field_name="spec__ram_gb", lookup_expr="gte")
    storage = filters.NumberFilter(field_name="spec__storage_gb", lookup_expr="exact")
    storage_min = filters.NumberFilter(field_name="spec__storage_gb", lookup_expr="gte")

    # ----- Network / connectivity -----
    has_2g = filters.BooleanFilter(field_name="spec__has_2g")
    has_3g = filters.BooleanFilter(field_name="spec__has_3g")
    has_4g = filters.BooleanFilter(field_name="spec__has_4g")
    has_5g = filters.BooleanFilter(field_name="spec__has_5g")
    has_nfc = filters.BooleanFilter(field_name="spec__nfc")
    has_wireless_charging = filters.BooleanFilter(method="filter_wireless_charging")
    has_ir = filters.BooleanFilter(field_name="spec__infrared")
    has_audio_jack = filters.BooleanFilter(field_name="spec__audio_jack")
    has_headphone_jack = filters.BooleanFilter(field_name="spec__audio_jack")

    # ----- Camera -----
    camera_min = filters.NumberFilter(field_name="spec__camera_mp", lookup_expr="gte")
    front_camera_min = filters.NumberFilter(
        field_name="spec__front_camera_mp", lookup_expr="gte"
    )

    # ----- Battery / charging -----
    battery_min = filters.NumberFilter(field_name="spec__battery_mah", lookup_expr="gte")
    charging_min = filters.NumberFilter(
        field_name="spec__charging_watts", lookup_expr="gte"
    )

    # ----- Display -----
    display_min = filters.NumberFilter(field_name="spec__display_inches", lookup_expr="gte")
    display_max = filters.NumberFilter(field_name="spec__display_inches", lookup_expr="lte")
    refresh_rate_min = filters.NumberFilter(
        field_name="spec__refresh_rate_hz", lookup_expr="gte"
    )

    # ----- Platform / chipset -----
    os = filters.CharFilter(field_name="spec__os", lookup_expr="iexact")
    processor = filters.CharFilter(
        field_name="spec__processor", lookup_expr="icontains"
    )
    chipset = filters.CharFilter(field_name="spec__chipset", lookup_expr="icontains")

    # ----- Build -----
    is_waterproof = filters.BooleanFilter(method="filter_waterproof")
    has_fingerprint = filters.BooleanFilter(field_name="spec__fingerprint_sensor")
    has_face_unlock = filters.BooleanFilter(field_name="spec__face_unlock")
    is_5g = filters.BooleanFilter(field_name="spec__has_5g")  # alias

    # ----- Editor / tags -----
    is_gaming = filters.BooleanFilter(field_name="spec__is_gaming")
    is_camera_flagship = filters.BooleanFilter(field_name="spec__is_camera_flagship")
    is_budget_friendly = filters.BooleanFilter(field_name="spec__is_budget_friendly")
    is_best_value = filters.BooleanFilter(field_name="spec__is_best_value")
    is_trending = filters.BooleanFilter(field_name="spec__is_trending")
    expert_rating_min = filters.NumberFilter(
        field_name="expert_rating", lookup_expr="gte"
    )
    rating_avg_min = filters.NumberFilter(field_name="rating_avg", lookup_expr="gte")

    class Meta:
        model = Product
        fields = ()

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(name__icontains=value)
            | Q(brand__name__icontains=value)
            | Q(spec__processor__icontains=value)
            | Q(spec__chipset__icontains=value)
        )

    def filter_in_stock(self, queryset, name, value):
        if value:
            return queryset.filter(stock__gt=0)
        return queryset

    def filter_wireless_charging(self, queryset, name, value):
        if value:
            return queryset.exclude(spec__wireless_charging__isnull=True).exclude(
                spec__wireless_charging=""
            )
        return queryset

    def filter_waterproof(self, queryset, name, value):
        if value:
            return queryset.exclude(spec__ip_rating__isnull=True).exclude(
                spec__ip_rating=""
            )
        return queryset
