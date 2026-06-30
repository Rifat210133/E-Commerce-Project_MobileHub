from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify


# --------------------------------------------------------------------------- #
# Brand
# --------------------------------------------------------------------------- #
class Brand(models.Model):
    name = models.CharField(max_length=100)
    logo = models.ImageField(upload_to="brands/", blank=True, null=True)
    slug = models.SlugField(unique=True, blank=True)
    country = models.CharField(max_length=60, blank=True)

    class Meta:
        ordering = ("name",)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


# --------------------------------------------------------------------------- #
# Product
# --------------------------------------------------------------------------- #
class Product(models.Model):
    MARKET_STATUS = [
        ("available", "Available"),
        ("upcoming", "Upcoming"),
        ("rumored", "Rumored"),
        ("discontinued", "Discontinued"),
    ]

    name = models.CharField(max_length=200)
    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, related_name="products")
    slug = models.SlugField(unique=True, blank=True)
    description = models.TextField(blank=True)
    short_description = models.CharField(max_length=300, blank=True)
    highlights = models.JSONField(default=list, blank=True)

    # Pricing & stock
    price = models.DecimalField(max_digits=10, decimal_places=2)
    original_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    stock = models.PositiveIntegerField(default=0)

    # Media
    images = models.JSONField(default=list, blank=True)
    video_url = models.URLField(blank=True)

    # Release info
    release_date = models.DateField(null=True, blank=True)
    market_status = models.CharField(
        max_length=20, choices=MARKET_STATUS, default="available"
    )
    made_by = models.CharField(max_length=100, blank=True)  # e.g. "Bangladesh", "China"
    announced = models.DateField(null=True, blank=True)

    # Variants: list of {label, ram_gb, storage_gb, price}
    variants = models.JSONField(default=list, blank=True)
    # Available colors: list of {name, hex}
    colors = models.JSONField(default=list, blank=True)
    # Available storage options: list of {gb, price_delta}
    storage_options = models.JSONField(default=list, blank=True)

    # Flags
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    is_new_arrival = models.BooleanField(default=False)

    # Ratings (denormalized for quick reads)
    rating_avg = models.DecimalField(
        max_digits=3, decimal_places=2, default=Decimal("0.00")
    )
    review_count = models.PositiveIntegerField(default=0)

    # Expert rating (overall 0–10)
    expert_rating = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(f"{self.brand.name}-{self.name}")
            slug = base
            i = 1
            while Product.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{i}"
                i += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def discount_percent(self) -> int:
        if self.original_price and self.original_price > self.price:
            return int(round((1 - self.price / self.original_price) * 100))
        return 0

    @property
    def in_stock(self) -> bool:
        return self.stock > 0

    def __str__(self) -> str:
        return f"{self.brand.name} {self.name}"


# --------------------------------------------------------------------------- #
# ProductSpec — full GSM-style spec sheet
# --------------------------------------------------------------------------- #
class ProductSpec(models.Model):
    DISPLAY_TYPE = [
        ("amoled", "AMOLED"),
        ("ltps_amoled", "LTPS AMOLED"),
        ("ltpo_amoled", "LTPO AMOLED"),
        ("oled", "OLED"),
        ("ips_lcd", "IPS LCD"),
        ("tft", "TFT"),
        ("pls_lcd", "PLS LCD"),
    ]

    product = models.OneToOneField(
        Product, on_delete=models.CASCADE, related_name="spec"
    )

    # ------------------------------ DISPLAY ------------------------------ #
    display_type = models.CharField(
        max_length=30, choices=DISPLAY_TYPE, default="amoled", blank=True
    )
    display_inches = models.DecimalField(max_digits=5, decimal_places=2, default=6.5)
    display_cm = models.DecimalField(max_digits=5, decimal_places=2, default=16.51)
    resolution_width = models.PositiveSmallIntegerField(default=1080)
    resolution_height = models.PositiveSmallIntegerField(default=2400)
    resolution_label = models.CharField(
        max_length=20, blank=True
    )  # e.g. "FHD+", "1.5K", "2K", "4K"
    aspect_ratio = models.CharField(max_length=10, blank=True)  # "19.5:9", "20:9"
    pixel_density_ppi = models.PositiveSmallIntegerField(default=400)
    screen_to_body_ratio_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=85.0
    )
    brightness_peak_nits = models.PositiveIntegerField(default=1000)
    brightness_typical_nits = models.PositiveIntegerField(default=800)
    hdr_support = models.CharField(
        max_length=80, blank=True
    )  # "HDR10, HDR10+, Dolby Vision"
    screen_protection = models.CharField(
        max_length=80, blank=True
    )  # "Corning Gorilla Glass Victus 2"
    bezel_less = models.BooleanField(default=True)
    touch_screen = models.CharField(
        max_length=60, blank=True
    )  # "Capacitive Touchscreen, Multi-touch"
    notch_type = models.CharField(
        max_length=40, blank=True
    )  # "Punch-hole", "Waterdrop", "None"
    refresh_rate_hz = models.PositiveSmallIntegerField(default=60)
    refresh_rate_secondary_hz = models.PositiveSmallIntegerField(null=True, blank=True)
    always_on_display = models.BooleanField(default=False)

    # ----------------------------- HARDWARE ------------------------------ #
    os = models.CharField(max_length=50, blank=True)
    os_version = models.CharField(max_length=30, blank=True)
    chipset = models.CharField(max_length=100, blank=True)
    processor = models.CharField(max_length=100, blank=True)
    cpu_details = models.CharField(
        max_length=200, blank=True
    )  # "Octa-core (1x3.3 GHz Cortex-X4 ...)"
    cpu_cores = models.PositiveSmallIntegerField(default=8)
    architecture = models.CharField(max_length=30, blank=True)  # "64 bit"
    fabrication_nm = models.PositiveSmallIntegerField(null=True, blank=True)  # 4, 5, 7
    gpu = models.CharField(max_length=80, blank=True)

    # --------------------------- MEMORY / STORAGE ------------------------ #
    ram_gb = models.PositiveSmallIntegerField(default=8)
    ram_type = models.CharField(max_length=30, blank=True)  # "LPDDR5X"
    storage_gb = models.PositiveSmallIntegerField(default=128)
    storage_type = models.CharField(max_length=30, blank=True)  # "UFS 4.0"
    usb_otg = models.BooleanField(default=True)

    # ------------------------- CAMERA (MAIN) ---------------------------- #
    camera_setup = models.CharField(
        max_length=40, blank=True
    )  # "Triple", "Quad", "Dual"
    camera_resolution_mp = models.PositiveSmallIntegerField(default=50)
    camera_resolution_detail = models.CharField(
        max_length=200, blank=True
    )  # "200 MP f/1.6 Wide + 50 MP f/2.0 Ultra-wide + 50 MP f/2.6 3x Telephoto"
    camera_aperture = models.CharField(max_length=20, blank=True)  # "f/1.6"
    camera_sensor = models.CharField(max_length=80, blank=True)  # "Sony IMX989"
    camera_sensor_size = models.CharField(max_length=30, blank=True)  # "1/0.98\""
    camera_focal_length = models.CharField(max_length=20, blank=True)  # "23mm"
    camera_autofocus = models.BooleanField(default=True)
    camera_ois = models.BooleanField(default=False)
    camera_eis = models.BooleanField(default=False)
    camera_flash = models.CharField(max_length=40, blank=True)  # "LED Flash"
    camera_image_resolution = models.CharField(
        max_length=40, blank=True
    )  # "16320 x 12240 Pixels"
    camera_settings = models.CharField(
        max_length=200, blank=True
    )  # "Exposure compensation, ISO control"
    camera_zoom = models.CharField(
        max_length=80, blank=True
    )  # "3x optical, 120x digital"
    camera_shooting_modes = models.CharField(
        max_length=200, blank=True
    )  # "Continuous Shooting, HDR, Burst"
    camera_features = models.TextField(blank=True)
    camera_video_resolution = models.CharField(
        max_length=80, blank=True
    )  # "8K@30fps, 4K@60fps"
    camera_video_fps = models.CharField(max_length=80, blank=True)  # "30 fps"

    # ----------------------- CAMERA (SELFIE / FRONT) -------------------- #
    front_camera_setup = models.CharField(max_length=40, blank=True)  # "Single"
    front_camera_mp = models.PositiveSmallIntegerField(default=12)
    front_camera_aperture = models.CharField(max_length=20, blank=True)  # "f/2.4"
    front_camera_autofocus = models.BooleanField(default=False)
    front_camera_flash = models.BooleanField(default=False)
    front_camera_video_resolution = models.CharField(
        max_length=80, blank=True
    )  # "4K@30fps"
    front_camera_features = models.TextField(blank=True)

    # ----------------------------- DESIGN ------------------------------- #
    height_mm = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    width_mm = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    thickness_mm = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    weight_g = models.PositiveSmallIntegerField(default=180)
    build_material = models.CharField(
        max_length=120, blank=True
    )  # "Back: Gorilla Glass, Frame: Aluminum"
    ip_rating = models.CharField(max_length=30, blank=True)  # "IP68"
    waterproof = models.CharField(
        max_length=120, blank=True
    )  # "Water resistant (up to 1.5m for 30 min)"
    ruggedness = models.CharField(
        max_length=80, blank=True
    )  # "Dust proof"
    form_factor = models.CharField(max_length=30, blank=True)  # "Touch", "Bar"

    # ---------------------------- BATTERY ------------------------------- #
    battery_type = models.CharField(
        max_length=30, blank=True
    )  # "Li-Ion (Lithium Ion)", "Li-Po"
    battery_mah = models.PositiveIntegerField(default=5000)
    wireless_charging = models.CharField(
        max_length=40, blank=True
    )  # "50W wireless", "No"
    quick_charging = models.CharField(
        max_length=80, blank=True
    )  # "100W SuperVOOC, 50% in 12 min"
    charging_watts = models.PositiveSmallIntegerField(default=67)
    battery_placement = models.CharField(
        max_length=30, blank=True, default="Non-removable"
    )
    usb_type = models.CharField(
        max_length=30, blank=True
    )  # "USB Type-C 3.2", "Lightning"

    # ----------------------------- NETWORK ------------------------------ #
    has_5g = models.BooleanField(default=False)
    has_4g = models.BooleanField(default=True)
    has_3g = models.BooleanField(default=True)
    has_2g = models.BooleanField(default=True)
    network_bands = models.TextField(blank=True)
    sim_slot = models.CharField(
        max_length=60, blank=True
    )  # "Dual SIM, GSM+GSM"
    sim_size = models.CharField(
        max_length=80, blank=True
    )  # "SIM1: Nano, SIM2: Nano"
    edge = models.BooleanField(default=True)
    gprs = models.BooleanField(default=True)
    volte = models.BooleanField(default=True)
    network_speed = models.CharField(
        max_length=60, blank=True
    )  # "HSPA, LTE, 5G"
    wlan = models.CharField(max_length=120, blank=True)  # "Wi-Fi 7 (802.11 a/b/g/n/ac/ax/be)"
    bluetooth = models.CharField(max_length=60, blank=True)  # "v5.4, A2DP, LE"
    gps = models.CharField(
        max_length=200, blank=True
    )  # "A-GPS, GLONASS, BDS, GALILEO, QZSS"
    nfc = models.BooleanField(default=False)
    infrared = models.BooleanField(default=False)
    wifi_hotspot = models.BooleanField(default=True)

    # ----------------------------- SENSORS ------------------------------ #
    fingerprint_sensor = models.BooleanField(default=True)
    fingerprint_position = models.CharField(
        max_length=40, blank=True
    )  # "On-screen", "Side-mounted"
    fingerprint_type = models.CharField(
        max_length=40, blank=True
    )  # "Ultrasonic", "Optical"
    face_unlock = models.BooleanField(default=True)
    sensors_list = models.CharField(
        max_length=300, blank=True
    )  # "Light, Proximity, Accelerometer, Compass, Gyroscope, Barometer"

    # --------------------------- MULTIMEDIA ----------------------------- #
    loudspeaker = models.BooleanField(default=True)
    audio_jack = models.CharField(
        max_length=40, blank=True
    )  # "USB Type-C", "3.5mm"
    audio_features = models.CharField(
        max_length=200, blank=True
    )  # "Dolby Atmos, Hi-Res Audio"
    video_formats = models.CharField(
        max_length=200, blank=True
    )  # "MP4, M4V, MKV, AVI, WEBM"

    # -------------------- RECOMMENDATION CAPABILITY FLAGS --------------- #
    is_gaming = models.BooleanField(default=False)
    is_camera_flagship = models.BooleanField(default=False)
    is_budget_friendly = models.BooleanField(default=False)
    is_best_value = models.BooleanField(default=False)
    is_trending = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"Spec<{self.product.name}>"


# --------------------------------------------------------------------------- #
# ProductRating — sub-scores + pros / cons / verdict
# --------------------------------------------------------------------------- #
class ProductRating(models.Model):
    product = models.OneToOneField(
        Product, on_delete=models.CASCADE, related_name="rating_breakdown"
    )
    design_score = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )
    display_score = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )
    performance_score = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )
    camera_score = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )
    battery_score = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )
    software_score = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )
    connectivity_score = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )
    value_score = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.00")
    )
    pros = models.JSONField(default=list, blank=True)
    cons = models.JSONField(default=list, blank=True)
    verdict = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"Rating<{self.product.name}>"


# --------------------------------------------------------------------------- #
# Review
# --------------------------------------------------------------------------- #
class Review(models.Model):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="reviews"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    title = models.CharField(max_length=150, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        unique_together = ("product", "user")

    def __str__(self) -> str:
        return f"{self.user.username} → {self.product.name} ({self.rating})"


# --------------------------------------------------------------------------- #
# HeroFeature — admin-curated "Featured today" phone on the home page
# --------------------------------------------------------------------------- #
class HeroFeature(models.Model):
    """Singleton row (pk=1) holding the home-page hero product and copy."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="+",
        null=True,
        blank=True,
    )
    eyebrow = models.CharField(
        max_length=80, blank=True, default="Premium Tech Core · 2024 Lineup"
    )
    title = models.CharField(
        max_length=120, blank=True, default="The phone you actually want."
    )
    subtitle = models.CharField(
        max_length=200, blank=True, default="Premium smartphones"
    )
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Hero feature"
        verbose_name_plural = "Hero feature"

    def save(self, *args, **kwargs):
        # Force singleton — always save to pk=1
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"HeroFeature → {self.product}"