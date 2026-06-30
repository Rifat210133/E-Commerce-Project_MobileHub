from django.contrib import admin

from .models import Brand, HeroFeature, Product, ProductRating, ProductSpec, Review


# --------------------------------------------------------------------------- #
# Brand
# --------------------------------------------------------------------------- #
@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "country")
    list_filter = ("country",)
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}


# --------------------------------------------------------------------------- #
# ProductSpec fieldsets — mirrored on the GSM spec sheet reference
# --------------------------------------------------------------------------- #
SPEC_FIELDSETS = (
    (
        "Display",
        {
            "fields": (
                ("display_type", "refresh_rate_hz", "refresh_rate_secondary_hz"),
                ("display_inches", "display_cm"),
                ("resolution_width", "resolution_height", "resolution_label"),
                ("aspect_ratio", "pixel_density_ppi", "screen_to_body_ratio_pct"),
                ("brightness_peak_nits", "brightness_typical_nits"),
                "hdr_support",
                "screen_protection",
                ("bezel_less", "always_on_display"),
                ("touch_screen", "notch_type"),
            )
        },
    ),
    (
        "Hardware / Chipset",
        {
            "fields": (
                ("os", "os_version"),
                ("chipset", "fabrication_nm"),
                "processor",
                "cpu_details",
                ("cpu_cores", "architecture"),
                "gpu",
            )
        },
    ),
    (
        "Memory & Storage",
        {
            "fields": (
                ("ram_gb", "ram_type"),
                ("storage_gb", "storage_type"),
                "usb_otg",
            )
        },
    ),
    (
        "Camera — Rear",
        {
            "fields": (
                ("camera_setup", "camera_resolution_mp"),
                "camera_resolution_detail",
                ("camera_aperture", "camera_sensor", "camera_sensor_size"),
                "camera_focal_length",
                ("camera_autofocus", "camera_ois", "camera_eis"),
                ("camera_flash", "camera_image_resolution"),
                "camera_settings",
                "camera_zoom",
                "camera_shooting_modes",
                "camera_features",
                ("camera_video_resolution", "camera_video_fps"),
            )
        },
    ),
    (
        "Camera — Selfie",
        {
            "fields": (
                ("front_camera_setup", "front_camera_mp"),
                ("front_camera_aperture", "front_camera_autofocus", "front_camera_flash"),
                "front_camera_video_resolution",
                "front_camera_features",
            )
        },
    ),
    (
        "Design",
        {
            "fields": (
                ("height_mm", "width_mm", "thickness_mm"),
                "weight_g",
                "build_material",
                ("ip_rating", "waterproof", "ruggedness"),
                "form_factor",
            )
        },
    ),
    (
        "Battery",
        {
            "fields": (
                ("battery_type", "battery_mah"),
                ("charging_watts", "quick_charging"),
                "wireless_charging",
                ("battery_placement", "usb_type"),
            )
        },
    ),
    (
        "Network & Connectivity",
        {
            "fields": (
                ("has_2g", "has_3g", "has_4g", "has_5g"),
                "network_bands",
                ("sim_slot", "sim_size"),
                ("edge", "gprs", "volte"),
                "network_speed",
                "wlan",
                "bluetooth",
                "gps",
                ("nfc", "infrared", "wifi_hotspot"),
            )
        },
    ),
    (
        "Sensors",
        {
            "fields": (
                ("fingerprint_sensor", "fingerprint_position", "fingerprint_type"),
                "face_unlock",
                "sensors_list",
            )
        },
    ),
    (
        "Multimedia",
        {
            "fields": (
                ("loudspeaker", "audio_jack"),
                "audio_features",
                "video_formats",
            )
        },
    ),
    (
        "Recommendation tags",
        {
            "fields": (
                ("is_gaming", "is_camera_flagship"),
                ("is_budget_friendly", "is_best_value"),
                "is_trending",
            )
        },
    ),
)


class SpecInline(admin.StackedInline):
    model = ProductSpec
    can_delete = False
    extra = 0
    fieldsets = SPEC_FIELDSETS
    classes = ("collapse",)


class RatingInline(admin.StackedInline):
    model = ProductRating
    can_delete = False
    extra = 0
    fieldsets = (
        (
            "Sub-ratings (0–10)",
            {
                "fields": (
                    ("design_score", "display_score"),
                    ("performance_score", "camera_score"),
                    ("battery_score", "software_score"),
                    ("connectivity_score", "value_score"),
                )
            },
        ),
        (
            "Verdict",
            {
                "fields": (("pros", "cons"), "verdict"),
            },
        ),
    )
    classes = ("collapse",)


# --------------------------------------------------------------------------- #
# Product
# --------------------------------------------------------------------------- #
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "price", "stock", "is_active", "is_featured", "rating_avg", "expert_rating")
    list_filter = ("brand", "is_active", "is_featured", "is_new_arrival", "market_status")
    search_fields = ("name", "brand__name", "short_description")
    prepopulated_fields = {"slug": ("name",)}
    list_editable = ("price", "stock", "is_active", "is_featured")
    readonly_fields = ("rating_avg", "review_count", "created_at", "updated_at")
    inlines = (SpecInline, RatingInline)

    fieldsets = (
        (
            "General",
            {
                "fields": (
                    ("name", "slug"),
                    "brand",
                    ("short_description", "is_new_arrival"),
                    "description",
                    "highlights",
                    "images",
                    "video_url",
                )
            },
        ),
        (
            "Pricing & Stock",
            {
                "fields": (
                    ("price", "original_price"),
                    "stock",
                    ("is_active", "is_featured"),
                )
            },
        ),
        (
            "Release info",
            {
                "fields": (
                    ("announced", "release_date"),
                    ("market_status", "made_by"),
                )
            },
        ),
        (
            "Variants & Colors",
            {
                "fields": (
                    "variants",
                    "colors",
                    "storage_options",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Ratings",
            {
                "fields": (("rating_avg", "review_count", "expert_rating"),),
            },
        ),
        (
            "Metadata",
            {
                "fields": (("created_at", "updated_at"),),
                "classes": ("collapse",),
            },
        ),
    )


# --------------------------------------------------------------------------- #
# ProductRating — direct list view (rarely edited outside inline)
# --------------------------------------------------------------------------- #
@admin.register(ProductRating)
class ProductRatingAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "design_score",
        "display_score",
        "performance_score",
        "camera_score",
        "battery_score",
    )
    search_fields = ("product__name",)


# --------------------------------------------------------------------------- #
# ProductSpec — list view for direct inspection
# --------------------------------------------------------------------------- #
@admin.register(ProductSpec)
class ProductSpecAdmin(admin.ModelAdmin):
    list_display = ("product", "display_inches", "chipset", "battery_mah", "has_5g")
    list_filter = ("has_5g", "display_type", "chipset")
    search_fields = ("product__name", "chipset", "processor")


# --------------------------------------------------------------------------- #
# Review
# --------------------------------------------------------------------------- #
@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("product", "user", "rating", "created_at")
    list_filter = ("rating", "created_at")
    search_fields = ("product__name", "user__username", "comment")


# --------------------------------------------------------------------------- #
# HeroFeature — singleton. The Django admin adds a "Save" button automatically,
# but we prevent creating additional rows so only one hero can ever exist.
# --------------------------------------------------------------------------- #
@admin.register(HeroFeature)
class HeroFeatureAdmin(admin.ModelAdmin):
    list_display = ("product", "is_active", "updated_at")
    search_fields = ("product__name", "product__brand__name")

    def has_add_permission(self, request):
        # Allow adding only if no row exists yet
        return not HeroFeature.objects.exists()