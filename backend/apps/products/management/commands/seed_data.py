"""Seed MobileHub with brands, products, users, and orders.

Run from the backend/ directory:
    python manage.py seed_data
"""

import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import UserProfile
from apps.orders.models import Cart, Order, WishList
from apps.products.models import Brand, Product, ProductRating, ProductSpec, Review

User = get_user_model()


# Image URLs use Unsplash so the demo runs offline-friendly without any
# bundled media assets.
UNSPLASH = "https://images.unsplash.com/"


BRANDS = [
    {
        "name": "Apple",
        "slug": "apple",
        "logo": f"{UNSPLASH}photo-1611532736597-de2d4265fba3?w=160&q=80",
    },
    {
        "name": "Samsung",
        "slug": "samsung",
        "logo": f"{UNSPLASH}photo-1610945415295-d9bbf067e59d?w=160&q=80",
    },
    {
        "name": "Google",
        "slug": "google",
        "logo": f"{UNSPLASH}photo-1573804633927-bfcbcd909acd?w=160&q=80",
    },
    {
        "name": "OnePlus",
        "slug": "oneplus",
        "logo": f"{UNSPLASH}photo-1598327105666-5b89351aff97?w=160&q=80",
    },
]


# 12 phones across brands
PHONES = [
    # Apple
    dict(brand="Apple", name="iPhone 15 Pro Max", price=1199, original_price=1299,
         image="photo-1696446702183-be1f58281937", stock=42, has_5g=True,
         ram=8, storage=256, camera=48, front_cam=12, battery=4422, charging=20,
         processor="Apple A17 Pro", display=6.7, refresh=120, os="iOS 17",
         is_camera_flagship=True, is_trending=True, rating=4.8),
    dict(brand="Apple", name="iPhone 15", price=799, original_price=899, image="photo-1592286927505-1def25115558",
         stock=58, has_5g=True, ram=6, storage=128, camera=48, front_cam=12, battery=3349, charging=20,
         processor="Apple A16 Bionic", display=6.1, refresh=60, os="iOS 17",
         is_best_value=True, rating=4.6),
    dict(brand="Apple", name="iPhone 14", price=699, original_price=799, image="photo-1663499482523-1c0c1bae4ce1",
         stock=24, has_5g=True, ram=6, storage=128, camera=12, front_cam=12, battery=3279, charging=20,
         processor="Apple A15 Bionic", display=6.1, refresh=60, os="iOS 16",
         is_budget_friendly=True, rating=4.5),
    # Samsung
    dict(brand="Samsung", name="Galaxy S24 Ultra", price=1299, original_price=1399,
         image="photo-1610945265064-0e34e5519bbf", stock=18, has_5g=True,
         ram=12, storage=512, camera=200, front_cam=12, battery=5000, charging=45,
         processor="Snapdragon 8 Gen 3", display=6.8, refresh=120, os="Android 14",
         is_camera_flagship=True, is_gaming=True, is_trending=True, rating=4.7),
    dict(brand="Samsung", name="Galaxy Z Fold 5", price=1799, original_price=1899,
         image="photo-1585060544812-6b45742d762f", stock=7, has_5g=True,
         ram=12, storage=512, camera=50, front_cam=10, battery=4400, charging=25,
         processor="Snapdragon 8 Gen 2", display=7.6, refresh=120, os="Android 13",
         is_trending=True, rating=4.6),
    dict(brand="Samsung", name="Galaxy A54", price=449, original_price=499,
         image="photo-1567581935884-3349723552ca", stock=62, has_5g=True,
         ram=8, storage=128, camera=50, front_cam=32, battery=5000, charging=25,
         processor="Exynos 1380", display=6.4, refresh=120, os="Android 13",
         is_budget_friendly=True, is_best_value=True, rating=4.4),
    # Google
    dict(brand="Google", name="Pixel 8 Pro", price=999, original_price=1099,
         image="photo-1598327105666-5b89351aff97", stock=29, has_5g=True,
         ram=12, storage=256, camera=50, front_cam=10.5, battery=5050, charging=30,
         processor="Google Tensor G3", display=6.7, refresh=120, os="Android 14",
         is_camera_flagship=True, is_trending=True, rating=4.7),
    dict(brand="Google", name="Pixel 8", price=699, original_price=799,
         image="photo-1592286927505-1def25115558", stock=34, has_5g=True,
         ram=8, storage=128, camera=50, front_cam=10.5, battery=4575, charging=27,
         processor="Google Tensor G3", display=6.2, refresh=120, os="Android 14",
         is_best_value=True, rating=4.6),
    dict(brand="Google", name="Pixel 7a", price=449, original_price=509,
         image="photo-1573804633927-bfcbcd909acd", stock=15, has_5g=True,
         ram=8, storage=128, camera=64, front_cam=13, battery=4385, charging=18,
         processor="Google Tensor G2", display=6.1, refresh=90, os="Android 13",
         is_budget_friendly=True, rating=4.4),
    # OnePlus
    dict(brand="OnePlus", name="OnePlus 12", price=799, original_price=899,
         image="photo-1610945265064-0e34e5519bbf", stock=21, has_5g=True,
         ram=12, storage=256, camera=50, front_cam=32, battery=5400, charging=100,
         processor="Snapdragon 8 Gen 3", display=6.82, refresh=120, os="Android 14",
         is_gaming=True, is_trending=True, rating=4.6),
    dict(brand="OnePlus", name="OnePlus 11", price=649, original_price=749,
         image="photo-1585060544812-6b45742d762f", stock=11, has_5g=True,
         ram=12, storage=256, camera=50, front_cam=16, battery=5000, charging=100,
         processor="Snapdragon 8 Gen 2", display=6.7, refresh=120, os="Android 13",
         is_gaming=True, is_best_value=True, rating=4.5),
    dict(brand="OnePlus", name="OnePlus Nord CE 3", price=349, original_price=399,
         image="photo-1567581935884-3349723552ca", stock=3, has_5g=True,
         ram=8, storage=128, camera=108, front_cam=16, battery=5000, charging=67,
         processor="Snapdragon 782G", display=6.7, refresh=120, os="Android 13",
         is_budget_friendly=True, rating=4.2),
]


SAMPLE_REVIEW_COMMENTS = [
    "Absolutely love the camera and battery life. Shipping was fast too.",
    "Great value for the price. Performs flawlessly day-to-day.",
    "Display is gorgeous and performance is buttery smooth.",
    "Solid phone but I wish the charging brick was included.",
    "Best upgrade I've made in years. Highly recommended.",
]


class Command(BaseCommand):
    help = "Seed MobileHub with brands, phones, users, and orders."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing data first.")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            self.stdout.write("Wiping existing data…")
            Order.objects.all().delete()
            Cart.objects.all().delete()
            WishList.objects.all().delete()
            Review.objects.all().delete()
            Product.objects.all().delete()
            Brand.objects.all().delete()
            User.objects.exclude(is_superuser=True).delete()

        # Brands
        brand_objs = {}
        for data in BRANDS:
            obj, _ = Brand.objects.update_or_create(
                slug=data["slug"],
                defaults={"name": data["name"], "logo": data["logo"]},
            )
            brand_objs[data["name"]] = obj
        self.stdout.write(self.style.SUCCESS(f"  Brands: {len(brand_objs)}"))

        # Products
        product_objs = []
        for data in PHONES:
            brand = brand_objs[data["brand"]]
            img_url = f"{UNSPLASH}{data['image']}?w=900&q=80"
            p, _ = Product.objects.update_or_create(
                brand=brand,
                name=data["name"],
                defaults={
                    "description": (
                        f"The {data['name']} delivers premium craftsmanship, a stunning display, "
                        "and powerful performance in a sleek, modern design."
                    ),
                    "price": Decimal(str(data["price"])),
                    "original_price": Decimal(str(data["original_price"])),
                    "stock": data["stock"],
                    "images": [img_url],
                    "is_active": True,
                    "rating_avg": Decimal(str(data.get("rating", 4.5))),
                    "review_count": random.randint(20, 240),
                },
            )
            ProductSpec.objects.update_or_create(
                product=p,
                defaults={
                    "ram_gb": data["ram"],
                    "storage_gb": data["storage"],
                    "camera_resolution_mp": data["camera"],
                    "front_camera_mp": data["front_cam"],
                    "processor": data["processor"],
                    "battery_mah": data["battery"],
                    "charging_watts": data["charging"],
                    "has_5g": data["has_5g"],
                    "display_inches": Decimal(str(data["display"])),
                    "refresh_rate_hz": data["refresh"],
                    "os": data["os"],
                    "is_gaming": data.get("is_gaming", False),
                    "is_camera_flagship": data.get("is_camera_flagship", False),
                    "is_budget_friendly": data.get("is_budget_friendly", False),
                    "is_best_value": data.get("is_best_value", False),
                    "is_trending": data.get("is_trending", False),
                },
            )
            product_objs.append(p)
        self.stdout.write(self.style.SUCCESS(f"  Products: {len(product_objs)}"))

        # Enrich flagship (iPhone 15 Pro Max) with full GSM spec-sheet data
        self._enrich_flagship(product_objs)

        # Seed comparison sample data for the demo customer
        self._seed_comparison_data(product_objs)

        # Users
        customer, created = User.objects.update_or_create(
            username="alice",
            defaults={
                "email": "alice@example.com",
                "first_name": "Alice",
                "last_name": "Carter",
                "is_staff": False,
            },
        )
        customer.set_password("password123")
        customer.save()
        if created or not hasattr(customer, "profile"):
            UserProfile.objects.get_or_create(
                user=customer,
                defaults={
                    "phone_number": "+1 415 555 0123",
                    "membership_tier": "Elite",
                    "address_book": [
                        {
                            "label": "Home",
                            "full_name": "Alice Carter",
                            "phone": "+880 1700 000000",
                            "address_line1": "House 12, Road 7",
                            "city": "Dhaka",
                            "state": "Dhaka",
                            "postal_code": "1207",
                            "country": "Bangladesh",
                        }
                    ],
                },
            )

        admin, created = User.objects.update_or_create(
            username="admin",
            defaults={
                "email": "admin@mobilehub.io",
                "first_name": "Admin",
                "last_name": "User",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        admin.set_password("admin12345")
        admin.save()
        UserProfile.objects.get_or_create(
            user=admin,
            defaults={"membership_tier": "Elite", "phone_number": "+1 415 555 0000"},
        )
        self.stdout.write(self.style.SUCCESS("  Users: alice/password123, admin/admin12345"))

        # Wishlist
        WishList.objects.get_or_create(user=customer)
        wl = customer.wishlist
        for p in random.sample(product_objs, k=min(4, len(product_objs))):
            wl.products.add(p)

        # Reviews
        for p in random.sample(product_objs, k=min(6, len(product_objs))):
            Review.objects.update_or_create(
                product=p,
                user=customer,
                defaults={
                    "rating": random.choice([4, 5, 5]),
                    "comment": random.choice(SAMPLE_REVIEW_COMMENTS),
                },
            )

        # Orders (5 in various statuses)
        Order.objects.filter(user=customer).delete()
        statuses = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered"]
        sample_address = {
            "full_name": "Rahim Ahmed",
            "phone": "+880 1700 000000",
            "address_line1": "House 12, Road 7",
            "city": "Dhaka",
            "state": "Dhaka",
            "postal_code": "1207",
            "country": "Bangladesh",
        }
        for i, status_value in enumerate(statuses, start=1):
            chosen = random.sample(product_objs, k=2)
            snap = [
                {
                    "product_id": p.id,
                    "product_slug": p.slug,
                    "product_name": p.name,
                    "brand_name": p.brand.name,
                    "image": p.images[0],
                    "price": str(p.price),
                    "quantity": 1,
                    "subtotal": str(p.price),
                }
                for p in chosen
            ]
            total = sum(Decimal(s["subtotal"]) for s in snap) + Decimal("9.99")
            days_ago = (len(statuses) - i) * 2
            Order.objects.create(
                order_number=f"MH-{random.randint(10000, 99999)}",
                user=customer,
                items=snap,
                total_amount=total,
                status=status_value,
                shipping_address=sample_address,
                estimated_arrival=date.today() + timedelta(days=max(1, 5 - i)),
                status_notes=(
                    "Your device has passed technical inspection and is being prepared for shipment."
                    if status_value in ("Confirmed", "Processing", "Shipped")
                    else ""
                ),
                created_at=timezone.now() - timedelta(days=days_ago),
            )

        self.stdout.write(self.style.SUCCESS(f"  Orders: 5 (varied statuses)"))

    # ------------------------------------------------------------------ #
    # Full GSM-spec enrichment for the demo flagship (iPhone 15 Pro Max)
    # ------------------------------------------------------------------ #
    def _enrich_flagship(self, product_objs):
        flagship = next((p for p in product_objs if "Pro Max" in p.name), product_objs[0])
        today = date.today()

        flagship.description = (
            "The iPhone 15 Pro Max features a titanium design, the powerful A17 Pro chip, "
            "and a new 48MP main camera with a 5x telephoto lens. Built for creators and "
            "professionals who demand the very best in mobile imaging and performance."
        )
        flagship.short_description = "Titanium. So strong. So light. So Pro."
        flagship.highlights = [
            "6.7\" Super Retina XDR display with ProMotion 120 Hz",
            "Apple A17 Pro chip built on a 3 nm process",
            "48 MP main + 12 MP ultrawide + 12 MP 5x telephoto",
            "Titanium body with Ceramic Shield front",
            "USB-C with USB 3 transfer speeds",
        ]
        flagship.release_date = today - timedelta(days=210)
        flagship.announced = today - timedelta(days=240)
        flagship.market_status = "available"
        flagship.made_by = "China"
        flagship.is_new_arrival = True
        flagship.expert_rating = Decimal("9.20")
        flagship.variants = [
            {"label": "256 GB", "ram_gb": 8, "storage_gb": 256, "price": "1199.00"},
            {"label": "512 GB", "ram_gb": 8, "storage_gb": 512, "price": "1399.00"},
            {"label": "1 TB", "ram_gb": 8, "storage_gb": 1024, "price": "1599.00"},
        ]
        flagship.colors = [
            {"name": "Natural Titanium", "hex": "#8E8E80"},
            {"name": "Blue Titanium", "hex": "#3F4A5C"},
            {"name": "White Titanium", "hex": "#F2F1EB"},
            {"name": "Black Titanium", "hex": "#1F1F1F"},
        ]
        flagship.storage_options = [
            {"gb": 256, "price_delta": 0},
            {"gb": 512, "price_delta": 200},
            {"gb": 1024, "price_delta": 400},
        ]
        flagship.save()

        # Full spec
        spec = flagship.spec
        spec.display_type = "ltpo_amoled"
        spec.display_inches = Decimal("6.70")
        spec.display_cm = Decimal("17.02")
        spec.resolution_width = 1290
        spec.resolution_height = 2796
        spec.resolution_label = "FHD+"
        spec.aspect_ratio = "19.5:9"
        spec.pixel_density_ppi = 460
        spec.screen_to_body_ratio_pct = Decimal("89.80")
        spec.brightness_peak_nits = 2000
        spec.brightness_typical_nits = 1000
        spec.hdr_support = "HDR10, Dolby Vision"
        spec.screen_protection = "Ceramic Shield glass"
        spec.bezel_less = True
        spec.touch_screen = "Capacitive Touchscreen, Multi-touch"
        spec.notch_type = "Dynamic Island"
        spec.refresh_rate_hz = 120
        spec.always_on_display = True

        spec.os = "iOS"
        spec.os_version = "17"
        spec.chipset = "Apple A17 Pro"
        spec.processor = "Apple A17 Pro (3 nm)"
        spec.cpu_details = "Hexa-core (2x3.78 GHz + 4x2.11 GHz)"
        spec.cpu_cores = 6
        spec.architecture = "64 bit"
        spec.fabrication_nm = 3
        spec.gpu = "Apple GPU (6-core graphics)"

        spec.ram_type = "LPDDR5"
        spec.storage_type = "NVMe"
        spec.usb_otg = False

        spec.camera_setup = "Triple"
        spec.camera_resolution_mp = 48
        spec.camera_resolution_detail = "48 MP f/1.78 Wide + 12 MP f/2.2 Ultra-wide + 12 MP f/2.8 5x Telephoto"
        spec.camera_aperture = "f/1.78"
        spec.camera_sensor = "Sony IMX803"
        spec.camera_sensor_size = "1/1.28\""
        spec.camera_focal_length = "24mm"
        spec.camera_autofocus = True
        spec.camera_ois = True
        spec.camera_eis = True
        spec.camera_flash = "Dual-LED dual-tone flash"
        spec.camera_image_resolution = "8000 x 6000 Pixels"
        spec.camera_settings = "Exposure compensation, ISO control"
        spec.camera_zoom = "5x optical, 25x digital"
        spec.camera_shooting_modes = "Continuous Shooting, HDR, Burst mode, Night mode"
        spec.camera_features = (
            "Deep Fusion, Smart HDR 5, Photonic Engine, ProRAW, "
            "Action mode, Cinematic mode (4K HDR), Log video"
        )
        spec.camera_video_resolution = "4K@60fps, 1080p@240fps"
        spec.camera_video_fps = "60 fps"

        spec.front_camera_setup = "Single"
        spec.front_camera_mp = 12
        spec.front_camera_aperture = "f/1.9"
        spec.front_camera_autofocus = True
        spec.front_camera_flash = False
        spec.front_camera_video_resolution = "4K@60fps"
        spec.front_camera_features = "Retina Flash, Smart HDR 5, Cinematic mode"

        spec.height_mm = Decimal("159.90")
        spec.width_mm = Decimal("76.70")
        spec.thickness_mm = Decimal("8.25")
        spec.weight_g = 221
        spec.build_material = "Back: Textured matte glass, Frame: Titanium"
        spec.ip_rating = "IP68"
        spec.waterproof = "Water resistant up to 6 meters for 30 minutes"
        spec.ruggedness = "Dust proof"
        spec.form_factor = "Touch"

        spec.battery_type = "Li-Ion"
        spec.battery_mah = 4422
        spec.charging_watts = 20
        spec.quick_charging = "20W wired, 50% in 30 min"
        spec.wireless_charging = "15W MagSafe, 7.5W Qi"
        spec.battery_placement = "Non-removable"
        spec.usb_type = "USB Type-C 3.2"

        spec.has_5g = True
        spec.has_4g = True
        spec.has_3g = True
        spec.has_2g = True
        spec.network_bands = "GSM / CDMA / HSPA / EVDO / LTE / 5G (sub-6 + mmWave)"
        spec.sim_slot = "Dual SIM, Nano-SIM + eSIM"
        spec.sim_size = "SIM1: Nano, SIM2: eSIM"
        spec.edge = True
        spec.gprs = True
        spec.volte = True
        spec.network_speed = "HSPA 42.2/5.76 Mbps, LTE-A, 5G"
        spec.wlan = "Wi-Fi 6E (802.11 a/b/g/n/ac/ax)"
        spec.bluetooth = "v5.3, A2DP, LE"
        spec.gps = "A-GPS, GLONASS, BDS, GALILEO, QZSS, iBeacon"
        spec.nfc = True
        spec.infrared = False
        spec.wifi_hotspot = True

        spec.fingerprint_sensor = False
        spec.fingerprint_position = ""
        spec.fingerprint_type = ""
        spec.face_unlock = True
        spec.sensors_list = (
            "Face ID, Accelerometer, Gyro, Proximity, Compass, Barometer, "
            "LiDAR scanner, Ambient light"
        )

        spec.loudspeaker = True
        spec.audio_jack = "USB Type-C"
        spec.audio_features = "Dolby Atmos, Spatial Audio"
        spec.video_formats = "HEVC, H.264, ProRes, HDR10, Dolby Vision"
        spec.save()

        ProductRating.objects.update_or_create(
            product=flagship,
            defaults={
                "design_score": Decimal("9.40"),
                "display_score": Decimal("9.50"),
                "performance_score": Decimal("9.80"),
                "camera_score": Decimal("9.30"),
                "battery_score": Decimal("8.20"),
                "software_score": Decimal("9.60"),
                "connectivity_score": Decimal("9.10"),
                "value_score": Decimal("8.00"),
                "pros": [
                    "Class-leading A17 Pro performance",
                    "Excellent 5x periscope telephoto camera",
                    "Premium titanium build with IP68",
                    "Long software support (5+ years)",
                ],
                "cons": [
                    "Expensive versus rivals",
                    "Slow 20W wired charging",
                    "No USB-C fast transfer on base storage",
                ],
                "verdict": (
                    "The iPhone 15 Pro Max is the most capable iPhone ever made. "
                    "Its titanium build, A17 Pro performance, and 5x periscope camera "
                    "make it a creative powerhouse — though you'll pay a premium for the privilege."
                ),
            },
        )

        self.stdout.write(self.style.SUCCESS("  Flagship spec sheet enriched (iPhone 15 Pro Max)"))

    def _seed_comparison_data(self, product_objs):
        from apps.comparison.models import CompareList

        from apps.accounts.models import UserProfile

        try:
            customer = User.objects.get(username="alice")
        except User.DoesNotExist:
            return
        cl, _ = CompareList.objects.get_or_create(user=customer)
        sample = product_objs[:3]
        for p in sample:
            cl.products.add(p)
        self.stdout.write(self.style.SUCCESS(f"  Compare sample: {len(sample)} items"))
        self.stdout.write(self.style.SUCCESS("Seed complete."))