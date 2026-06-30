"""Seed MobileHub's catalog with 100+ phones across 25+ brands.

Adds new brands + phones with full GSM-style spec sheets, ratings, and
realistic product images. Does NOT touch users, orders, or reviews.

Usage (from backend/):
    python manage.py seed_catalog
    python manage.py seed_catalog --reset   # wipe products+brands first
"""

import random
from decimal import Decimal
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from apps.products.models import Brand, Product, ProductRating, ProductSpec


UNSPLASH = "https://images.unsplash.com/"

# Per-brand Unsplash logo slugs (any small branded-looking image works fine)
BRANDS = [
    # Tier 1 — flagships
    ("Apple", "USA", "photo-1611532736597-de2d4265fba3"),
    ("Samsung", "South Korea", "photo-1610945265064-0e34e5519bbf"),
    ("Google", "USA", "photo-1573804633927-bfcbcd909acd"),
    ("OnePlus", "China", "photo-1598327105666-5b89351aff97"),
    ("Xiaomi", "China", "photo-1606293459339-aa5d34a7b0e1"),
    ("Huawei", "China", "photo-1551431009-a802eeec77b1"),
    ("Honor", "China", "photo-1567581935884-3349723552ca"),
    ("Sony", "Japan", "photo-1605236453806-6ff36851218e"),
    # Tier 2 — strong mid/high
    ("Oppo", "China", "photo-1580910051074-3eb694886505"),
    ("Vivo", "China", "photo-1592899677977-9c10ca588bbd"),
    ("Realme", "China", "photo-1592434134753-a70baf7979d5"),
    ("Motorola", "USA", "photo-1564466809058-bf4114d55352"),
    ("Nothing", "UK", "photo-1610792516775-01de03eae630"),
    ("Asus", "Taiwan", "photo-1551816230-ef5deaed4a26"),
    ("Nokia", "Finland", "photo-1567581935884-3349723552ca"),
    # Tier 3 — value/budget
    ("Infinix", "China", "photo-1556656893-85d3e8d7b3b3"),
    ("Tecno", "China", "photo-1567581935884-3349723552ca"),
    ("iQOO", "China", "photo-1592434134753-a70baf7979d5"),
    ("Poco", "China", "photo-1606293459339-aa5d34a7b0e1"),
    ("Meizu", "China", "photo-1580910051074-3eb694886505"),
    ("Lenovo", "China", "photo-1551816230-ef5deaed4a26"),
    ("ZTE", "China", "photo-1592899677977-9c10ca588bbd"),
    # Tier 4 — niche
    ("Sharp", "Japan", "photo-1605236453806-6ff36851218e"),
    ("HTC", "Taiwan", "photo-1551816230-ef5deaed4a26"),
    ("Cat", "UK", "photo-1564466809058-bf4114d55352"),
    ("Lava", "India", "photo-1567581935884-3349723552ca"),
    ("Micromax", "India", "photo-1567581935884-3349723552ca"),
    ("Alcatel", "France", "photo-1567581935884-3349723552ca"),
    ("Itel", "China", "photo-1567581935884-3349723552ca"),
]

# Common Unsplash photo IDs for phone product shots (rotated per item)
PHONE_SHOTS = [
    "photo-1511707171634-5f897ff02aa9",
    "photo-1592286927505-1def25115558",
    "photo-1567581935884-3349723552ca",
    "photo-1606293459339-aa5d34a7b0e1",
    "photo-1592899677977-9c10ca588bbd",
    "photo-1556656893-85d3e8d7b3b3",
    "photo-1573804633927-bfcbcd909acd",
    "photo-1605236453806-6ff36851218e",
    "photo-1610945265064-0e34e5519bbf",
    "photo-1610792516775-01de03eae630",
    "photo-1598327105666-5b89351aff97",
    "photo-1564466809058-bf4114d55352",
    "photo-1551816230-ef5deaed4a26",
    "photo-1580910051074-3eb694886505",
    "photo-1592434134753-a70baf7979d5",
    "photo-1663499482523-1c0c1bae4ce1",
    "photo-1696446702183-be1f58281937",
    "photo-1585060544812-6b45742d762f",
]


# ---------------------------------------------------------------------------
# Phone catalogue
# ---------------------------------------------------------------------------
# (brand, name, year, tier, ram_gb, storage_gb, camera_mp, front_mp, battery,
#  charging_watts, has_5g, refresh_hz, display_inches, processor, price)
# tier: 0=budget, 1=mid, 2=high, 3=flagship
# ---------------------------------------------------------------------------
PHONES = [
    # Apple — 6
    ("Apple", "iPhone 15 Pro Max", 2024, 3, 8, 256, 48, 12, 4422, 20, True, 120, 6.7, "Apple A17 Pro", 1199),
    ("Apple", "iPhone 15 Pro", 2024, 3, 8, 128, 48, 12, 3274, 20, True, 120, 6.1, "Apple A17 Pro", 999),
    ("Apple", "iPhone 15 Plus", 2024, 2, 6, 128, 48, 12, 4383, 20, True, 60, 6.7, "Apple A16 Bionic", 899),
    ("Apple", "iPhone 15", 2024, 2, 6, 128, 48, 12, 3349, 20, True, 60, 6.1, "Apple A16 Bionic", 799),
    ("Apple", "iPhone 14 Pro Max", 2023, 3, 6, 256, 48, 12, 4323, 20, True, 120, 6.7, "Apple A16 Bionic", 1099),
    ("Apple", "iPhone 14", 2023, 1, 6, 128, 12, 12, 3279, 20, True, 60, 6.1, "Apple A15 Bionic", 699),
    ("Apple", "iPhone 13", 2022, 1, 4, 128, 12, 12, 3240, 20, True, 60, 6.1, "Apple A15 Bionic", 599),
    ("Apple", "iPhone SE (2024)", 2024, 0, 4, 128, 48, 7, 2018, 20, True, 60, 4.7, "Apple A15 Bionic", 429),

    # Samsung — 8
    ("Samsung", "Galaxy S24 Ultra", 2024, 3, 12, 512, 200, 12, 5000, 45, True, 120, 6.8, "Snapdragon 8 Gen 3", 1299),
    ("Samsung", "Galaxy S24+", 2024, 3, 12, 256, 50, 12, 4900, 45, True, 120, 6.7, "Snapdragon 8 Gen 3", 999),
    ("Samsung", "Galaxy S24", 2024, 2, 8, 256, 50, 12, 4000, 25, True, 120, 6.2, "Snapdragon 8 Gen 3", 799),
    ("Samsung", "Galaxy S23 Ultra", 2023, 3, 12, 256, 200, 12, 5000, 45, True, 120, 6.8, "Snapdragon 8 Gen 2", 1199),
    ("Samsung", "Galaxy Z Fold 5", 2023, 3, 12, 512, 50, 10, 4400, 25, True, 120, 7.6, "Snapdragon 8 Gen 2", 1799),
    ("Samsung", "Galaxy Z Flip 5", 2023, 3, 8, 256, 12, 10, 3700, 25, True, 120, 6.7, "Snapdragon 8 Gen 2", 999),
    ("Samsung", "Galaxy A54", 2023, 1, 8, 128, 50, 32, 5000, 25, True, 120, 6.4, "Exynos 1380", 449),
    ("Samsung", "Galaxy A34", 2023, 1, 6, 128, 48, 13, 5000, 25, True, 120, 6.6, "Dimensity 1080", 349),
    ("Samsung", "Galaxy A14", 2023, 0, 4, 64, 50, 13, 5000, 15, False, 60, 6.6, "Exynos 850", 179),
    ("Samsung", "Galaxy M54", 2023, 1, 8, 256, 108, 32, 6000, 25, True, 120, 6.7, "Snapdragon 7 Gen 1", 449),

    # Google — 5
    ("Google", "Pixel 8 Pro", 2023, 3, 12, 256, 50, 10.5, 5050, 30, True, 120, 6.7, "Google Tensor G3", 999),
    ("Google", "Pixel 8", 2023, 2, 8, 128, 50, 10.5, 4575, 27, True, 120, 6.2, "Google Tensor G3", 699),
    ("Google", "Pixel 7a", 2023, 1, 8, 128, 64, 13, 4385, 18, True, 90, 6.1, "Google Tensor G2", 449),
    ("Google", "Pixel 7 Pro", 2022, 3, 12, 256, 50, 10.8, 5000, 23, True, 120, 6.7, "Google Tensor G2", 899),
    ("Google", "Pixel 6a", 2022, 1, 6, 128, 12.2, 8, 4410, 18, True, 60, 6.1, "Google Tensor", 349),

    # OnePlus — 6
    ("OnePlus", "OnePlus 12", 2024, 3, 12, 256, 50, 32, 5400, 100, True, 120, 6.82, "Snapdragon 8 Gen 3", 799),
    ("OnePlus", "OnePlus 11", 2023, 2, 12, 256, 50, 16, 5000, 100, True, 120, 6.7, "Snapdragon 8 Gen 2", 649),
    ("OnePlus", "OnePlus Open", 2023, 3, 16, 512, 48, 20, 4805, 67, True, 120, 7.82, "Snapdragon 8 Gen 2", 1699),
    ("OnePlus", "OnePlus Nord 3", 2023, 1, 8, 128, 50, 16, 5000, 80, True, 120, 6.74, "Dimensity 9000", 449),
    ("OnePlus", "OnePlus Nord CE 3", 2023, 1, 8, 128, 108, 16, 5000, 67, True, 120, 6.7, "Snapdragon 782G", 349),
    ("OnePlus", "OnePlus Nord N30", 2023, 0, 8, 128, 108, 16, 5000, 50, True, 120, 6.72, "Snapdragon 695", 249),

    # Xiaomi — 7
    ("Xiaomi", "Xiaomi 14 Ultra", 2024, 3, 16, 512, 50, 32, 5000, 90, True, 120, 6.73, "Snapdragon 8 Gen 3", 1199),
    ("Xiaomi", "Xiaomi 14", 2024, 3, 12, 256, 50, 32, 4610, 90, True, 120, 6.36, "Snapdragon 8 Gen 3", 899),
    ("Xiaomi", "Xiaomi 13T Pro", 2023, 2, 12, 256, 50, 20, 5000, 120, True, 144, 6.67, "Dimensity 9200+", 649),
    ("Xiaomi", "Xiaomi Redmi Note 13 Pro+", 2024, 1, 12, 256, 200, 16, 5000, 120, True, 120, 6.67, "Dimensity 7200 Ultra", 399),
    ("Xiaomi", "Xiaomi Redmi Note 13 Pro", 2024, 1, 8, 256, 200, 16, 5100, 67, True, 120, 6.67, "Snapdragon 7s Gen 2", 289),
    ("Xiaomi", "Xiaomi Redmi 13C", 2023, 0, 4, 128, 50, 8, 5000, 18, False, 60, 6.74, "Helio G85", 129),
    ("Xiaomi", "Xiaomi Poco F6 Pro", 2024, 2, 12, 256, 50, 20, 5000, 120, True, 120, 6.67, "Snapdragon 8 Gen 2", 549),

    # Huawei — 4
    ("Huawei", "Huawei P60 Pro", 2023, 3, 8, 256, 48, 13, 4815, 88, True, 120, 6.67, "Snapdragon 8+ Gen 1 4G", 999),
    ("Huawei", "Huawei Mate 60 Pro", 2023, 3, 12, 512, 50, 13, 5000, 88, True, 120, 6.82, "Kirin 9000S", 1099),
    ("Huawei", "Huawei Nova 12", 2023, 1, 8, 256, 50, 60, 4600, 100, True, 120, 6.7, "Kirin 8000", 449),
    ("Huawei", "Huawei Y90", 2023, 0, 6, 128, 50, 8, 5000, 22, False, 60, 6.7, "Snapdragon 680", 199),

    # Honor — 4
    ("Honor", "Honor Magic 6 Pro", 2024, 3, 12, 512, 50, 50, 5600, 80, True, 120, 6.8, "Snapdragon 8 Gen 3", 1099),
    ("Honor", "Honor Magic V2", 2023, 3, 16, 512, 50, 16, 5000, 66, True, 120, 7.92, "Snapdragon 8 Gen 2", 1299),
    ("Honor", "Honor 90", 2023, 1, 8, 256, 200, 50, 5000, 66, True, 120, 6.7, "Snapdragon 7 Gen 1", 399),
    ("Honor", "Honor X8b", 2024, 0, 8, 256, 108, 50, 4500, 35, True, 120, 6.7, "Snapdragon 680", 229),

    # Sony — 3
    ("Sony", "Sony Xperia 1 VI", 2024, 3, 12, 256, 48, 12, 5000, 30, True, 120, 6.5, "Snapdragon 8 Gen 3", 1199),
    ("Sony", "Sony Xperia 5 V", 2023, 2, 8, 128, 48, 12, 5000, 30, True, 120, 6.1, "Snapdragon 8 Gen 2", 849),
    ("Sony", "Sony Xperia 10 V", 2023, 1, 6, 128, 48, 8, 5000, 21, True, 60, 6.1, "Snapdragon 695", 349),

    # Oppo — 6
    ("Oppo", "Oppo Find X7 Ultra", 2024, 3, 16, 512, 50, 32, 5000, 100, True, 120, 6.82, "Snapdragon 8 Gen 3", 1099),
    ("Oppo", "Oppo Find N3 Flip", 2023, 3, 12, 256, 50, 32, 4300, 44, True, 120, 6.8, "Dimensity 9200", 999),
    ("Oppo", "Oppo Reno 11 Pro", 2024, 2, 12, 256, 50, 32, 4600, 80, True, 120, 6.74, "Dimensity 8200", 549),
    ("Oppo", "Oppo Reno 11", 2024, 1, 8, 256, 50, 32, 5000, 67, True, 120, 6.7, "Dimensity 7050", 349),
    ("Oppo", "Oppo A78", 2023, 0, 8, 128, 50, 8, 5000, 33, True, 90, 6.56, "Dimensity 700", 199),
    ("Oppo", "Oppo A18", 2023, 0, 4, 64, 8, 5, 5000, 10, False, 60, 6.56, "Helio G85", 119),

    # Vivo — 5
    ("Vivo", "Vivo X100 Pro", 2024, 3, 12, 256, 50, 32, 5400, 100, True, 120, 6.78, "Dimensity 9300", 999),
    ("Vivo", "Vivo X90 Pro+", 2023, 3, 12, 256, 50.3, 32, 4700, 80, True, 120, 6.78, "Snapdragon 8 Gen 2", 1099),
    ("Vivo", "Vivo V30 Pro", 2024, 2, 12, 256, 50, 50, 5000, 80, True, 120, 6.78, "Dimensity 8200", 549),
    ("Vivo", "Vivo V29", 2023, 1, 8, 256, 50, 50, 4600, 80, True, 120, 6.78, "Snapdragon 778G", 399),
    ("Vivo", "Vivo Y36", 2023, 0, 8, 128, 50, 16, 5000, 44, True, 60, 6.64, "Snapdragon 680", 199),

    # Realme — 6
    ("Realme", "Realme GT 5 Pro", 2024, 3, 12, 256, 50, 32, 5400, 100, True, 144, 6.78, "Snapdragon 8 Gen 3", 549),
    ("Realme", "Realme GT Neo 5", 2023, 2, 12, 256, 50, 16, 5000, 150, True, 144, 6.74, "Snapdragon 8+ Gen 1", 449),
    ("Realme", "Realme 12 Pro+", 2024, 1, 8, 256, 50, 32, 5000, 67, True, 120, 6.7, "Snapdragon 7s Gen 2", 349),
    ("Realme", "Realme 12 Pro", 2024, 1, 8, 256, 50, 16, 5000, 67, True, 120, 6.7, "Snapdragon 6 Gen 1", 299),
    ("Realme", "Realme C67", 2023, 0, 6, 128, 108, 8, 5000, 33, True, 90, 6.72, "Helio G85", 179),
    ("Realme", "Realme Note 50", 2024, 0, 4, 64, 13, 5, 5000, 10, False, 60, 6.74, "Unisoc Tiger T612", 99),

    # Motorola — 5
    ("Motorola", "Motorola Edge 50 Ultra", 2024, 3, 12, 512, 50, 50, 4500, 125, True, 144, 6.7, "Snapdragon 8s Gen 3", 999),
    ("Motorola", "Motorola Edge 40 Pro", 2023, 2, 12, 256, 50, 60, 4600, 125, True, 165, 6.67, "Snapdragon 8 Gen 2", 799),
    ("Motorola", "Motorola Razr 40 Ultra", 2023, 3, 8, 256, 12, 32, 3800, 30, True, 165, 6.9, "Snapdragon 8+ Gen 1", 999),
    ("Motorola", "Motorola Moto G84", 2023, 1, 8, 256, 50, 16, 5000, 30, True, 120, 6.55, "Snapdragon 695", 279),
    ("Motorola", "Motorola Moto G14", 2023, 0, 4, 128, 50, 8, 5000, 20, False, 60, 6.5, "Unisoc Tiger T616", 139),

    # Nothing — 2
    ("Nothing", "Nothing Phone (2)", 2023, 2, 12, 256, 50, 32, 4700, 45, True, 120, 6.7, "Snapdragon 8+ Gen 1", 599),
    ("Nothing", "Nothing Phone (2a)", 2024, 1, 8, 128, 50, 32, 5000, 45, True, 120, 6.7, "Dimensity 7200 Pro", 349),

    # Asus — 2
    ("Asus", "Asus ROG Phone 8 Pro", 2024, 3, 16, 512, 50, 32, 5500, 65, True, 165, 6.78, "Snapdragon 8 Gen 3", 1099),
    ("Asus", "Asus ROG Phone 7", 2023, 3, 16, 512, 50, 32, 6000, 65, True, 165, 6.78, "Snapdragon 8 Gen 2", 999),

    # Nokia — 3
    ("Nokia", "Nokia X30", 2022, 2, 8, 256, 50, 16, 4200, 33, True, 90, 6.43, "Snapdragon 695", 449),
    ("Nokia", "Nokia G42", 2023, 1, 6, 128, 50, 8, 5000, 20, True, 90, 6.56, "Snapdragon 480+", 199),
    ("Nokia", "Nokia C32", 2023, 0, 4, 64, 50, 8, 5000, 10, False, 60, 6.5, "Unisoc Tiger T606", 119),

    # Infinix — 4
    ("Infinix", "Infinix GT 20 Pro", 2024, 2, 8, 256, 108, 32, 5000, 45, True, 120, 6.78, "Dimensity 8200 Ultimate", 329),
    ("Infinix", "Infinix Note 40 Pro+", 2024, 1, 12, 256, 108, 32, 4600, 100, True, 120, 6.78, "Dimensity 7020", 299),
    ("Infinix", "Infinix Hot 40 Pro", 2024, 0, 8, 128, 108, 32, 5000, 33, True, 120, 6.78, "Helio G99", 179),
    ("Infinix", "Infinix Smart 8", 2024, 0, 3, 64, 13, 8, 5000, 10, False, 60, 6.6, "Unisoc Tiger T606", 89),

    # Tecno — 4
    ("Tecno", "Tecno Phantom X2 Pro", 2023, 2, 12, 256, 50, 32, 5160, 45, True, 120, 6.8, "Dimensity 9000", 599),
    ("Tecno", "Tecno Camon 20 Pro", 2023, 1, 8, 256, 64, 32, 5000, 33, True, 120, 6.67, "Helio G99", 249),
    ("Tecno", "Tecno Spark 20 Pro+", 2024, 0, 8, 256, 108, 32, 5000, 33, True, 120, 6.78, "Helio G99 Ultimate", 199),
    ("Tecno", "Tecno Pop 8", 2024, 0, 3, 64, 12, 8, 5000, 10, False, 60, 6.56, "Unisoc Tiger T606", 79),

    # iQOO — 4
    ("iQOO", "iQOO 12 Pro", 2024, 3, 16, 512, 50, 16, 5100, 120, True, 144, 6.78, "Snapdragon 8 Gen 3", 949),
    ("iQOO", "iQOO Neo 9 Pro", 2024, 2, 12, 256, 50, 16, 5160, 120, True, 144, 6.78, "Dimensity 9300", 449),
    ("iQOO", "iQOO Z9", 2024, 1, 8, 128, 50, 16, 5000, 44, True, 120, 6.67, "Dimensity 7200", 249),
    ("iQOO", "iQOO Z9 Lite", 2024, 0, 6, 128, 50, 8, 5000, 15, True, 120, 6.56, "Dimensity 6300", 149),

    # Poco — 3
    ("Poco", "Poco F6 Pro", 2024, 2, 12, 256, 50, 20, 5000, 120, True, 120, 6.67, "Snapdragon 8 Gen 2", 549),
    ("Poco", "Poco X6 Pro", 2024, 1, 8, 256, 64, 16, 5000, 67, True, 120, 6.67, "Dimensity 8300 Ultra", 299),
    ("Poco", "Poco C65", 2023, 0, 6, 128, 50, 8, 5000, 18, False, 60, 6.74, "Helio G85", 119),

    # Meizu — 2
    ("Meizu", "Meizu 21", 2023, 2, 8, 256, 200, 32, 4800, 80, True, 120, 6.55, "Snapdragon 8 Gen 3", 549),
    ("Meizu", "Meizu 20", 2023, 1, 12, 128, 50, 32, 4700, 67, True, 144, 6.55, "Snapdragon 8 Gen 2", 399),

    # Lenovo — 2
    ("Lenovo", "Lenovo Legion Phone 3", 2024, 3, 16, 512, 50, 16, 5500, 68, True, 165, 6.92, "Snapdragon 8 Gen 3", 799),
    ("Lenovo", "Lenovo K14 Plus", 2023, 0, 4, 64, 48, 8, 5000, 20, True, 60, 6.5, "Unisoc Tiger T606", 129),

    # ZTE — 2
    ("ZTE", "ZTE Axon 50 Ultra", 2023, 2, 12, 256, 64, 32, 5000, 80, True, 120, 6.67, "Snapdragon 8+ Gen 1", 549),
    ("ZTE", "ZTE Blade V50", 2023, 0, 6, 128, 50, 8, 5000, 22, True, 90, 6.6, "Unisoc Tiger T616", 149),

    # Sharp — 1
    ("Sharp", "Sharp Aquos R8 Pro", 2023, 3, 12, 256, 47, 12, 5000, 27, True, 120, 6.6, "Snapdragon 8 Gen 2", 849),

    # HTC — 1
    ("HTC", "HTC U24 Pro", 2024, 2, 12, 256, 50, 50, 4600, 60, True, 120, 6.7, "Snapdragon 7 Gen 3", 499),

    # Cat — 1
    ("Cat", "Cat S75", 2023, 1, 6, 128, 50, 8, 5000, 15, True, 120, 6.58, "Dimensity 930", 549),

    # Lava — 1
    ("Lava", "Lava Agni 3 5G", 2024, 1, 8, 128, 50, 16, 5000, 66, True, 120, 6.78, "Dimensity 7300X", 219),

    # Micromax — 1
    ("Micromax", "Micromax In Note 2", 2022, 0, 4, 64, 48, 16, 5000, 30, True, 60, 6.43, "Helio G88", 129),

    # Alcatel — 1
    ("Alcatel", "Alcatel 3X (2023)", 2023, 0, 4, 128, 50, 8, 5000, 18, True, 60, 6.56, "Helio P22", 119),

    # Itel — 1
    ("Itel", "Itel S24", 2024, 0, 4, 128, 108, 8, 5000, 18, True, 90, 6.6, "Unisoc Tiger T606", 99),
]


# Map (display_inches → resolution_label) for the spec
DISPLAY_RES = {
    6.1: ("FHD+", 1080, 2400),
    6.2: ("FHD+", 1080, 2400),
    6.36: ("1.5K", 1200, 2670),
    6.4: ("FHD+", 1080, 2400),
    6.43: ("FHD+", 1080, 2400),
    6.5: ("FHD+", 1080, 2340),
    6.55: ("FHD+", 1080, 2400),
    6.56: ("HD+", 720, 1612),
    6.58: ("FHD+", 1080, 2408),
    6.6: ("FHD+", 1080, 2400),
    6.64: ("FHD+", 1080, 2388),
    6.67: ("1.5K", 1220, 2712),
    6.7: ("FHD+", 1080, 2412),
    6.73: ("2K", 1440, 3200),
    6.74: ("FHD+", 1080, 2400),
    6.78: ("1.5K", 1260, 2800),
    6.8: ("FHD+", 1116, 2480),
    6.82: ("FHD+", 1116, 2480),
    6.9: ("FHD+", 1080, 2640),
    6.92: ("FHD+", 1080, 2460),
    7.6: ("QXGA+", 1812, 2176),
    7.82: ("2K", 2268, 2440),
    7.92: ("FHD+", 2156, 2344),
    4.7: ("HD", 750, 1334),
}


def _slug(name: str) -> str:
    import re
    s = name.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def _make_image(brand: str, idx: int) -> str:
    # Rotate Unsplash shots so phones don't all look identical
    slug = PHONE_SHOTS[idx % len(PHONE_SHOTS)]
    return f"{UNSPLASH}{slug}?w=900&q=80"


def _build_spec(phone, price):
    (
        brand, name, year, tier, ram, storage, camera_mp, front_mp, battery,
        charging, has_5g, refresh, display_in, processor, _price,
    ) = phone

    res_label, res_w, res_h = DISPLAY_RES.get(
        float(display_in), ("FHD+", 1080, 2400)
    )
    is_fold = "Fold" in name or "Flip" in name or "Razr" in name or "Z " in name
    display_type = (
        "ltpo_amoled" if tier == 3 and not is_fold
        else "ltps_amoled" if tier >= 2
        else "amoled" if tier == 1
        else "ips_lcd"
    )
    storage_type = (
        "UFS 4.0" if tier == 3 else
        "UFS 3.1" if tier == 2 else
        "UFS 2.2" if tier == 1 else
        "eMMC 5.1"
    )
    ram_type = (
        "LPDDR5X" if tier >= 2 else
        "LPDDR4X"
    )
    is_gaming = tier == 3 or "ROG" in name or "Legion" in name or "GT " in name
    is_camera_flagship = tier == 3 and camera_mp >= 48
    is_budget = tier == 0
    is_best_value = tier == 1 and price < 400
    is_trending = tier >= 2 and year >= 2023

    return dict(
        # Display
        display_type=display_type,
        display_inches=Decimal(str(display_in)),
        display_cm=Decimal(str(round(display_in * 2.54, 2))),
        resolution_width=res_w,
        resolution_height=res_h,
        resolution_label=res_label,
        aspect_ratio=("21:9" if is_fold else "20:9" if res_h > 2200 else "19.5:9"),
        pixel_density_ppi=int(res_w / display_in * 160),
        screen_to_body_ratio_pct=Decimal(str(88.0 if tier >= 2 else 85.0)),
        brightness_peak_nits=2400 if tier == 3 else 1800 if tier == 2 else 1200,
        brightness_typical_nits=1200 if tier >= 2 else 800,
        hdr_support=("HDR10+, Dolby Vision" if tier >= 2 else "HDR10"),
        screen_protection=(
            "Corning Gorilla Glass Victus 2" if tier == 3
            else "Corning Gorilla Glass 5" if tier >= 1
            else "Tempered glass"
        ),
        bezel_less=True,
        touch_screen="Capacitive Touchscreen, Multi-touch",
        notch_type=("Punch-hole" if tier >= 1 else "Waterdrop"),
        refresh_rate_hz=refresh,
        refresh_rate_secondary_hz=None,
        always_on_display=(tier >= 2),
        # Hardware
        os="Android 14" if brand != "Apple" else "iOS 17",
        os_version="14" if brand != "Apple" else "17",
        chipset=processor,
        processor=processor,
        cpu_details=(
            f"Octa-core ({processor} flagship cores) · 64-bit"
        ),
        cpu_cores=8,
        architecture="64 bit",
        fabrication_nm=(
            4 if tier == 3 else 5 if tier == 2 else 6 if tier == 1 else 12
        ),
        gpu=(
            "Apple GPU (6-core)" if brand == "Apple"
            else "Adreno 750" if "8 Gen 3" in processor
            else "Adreno 740" if "8 Gen 2" in processor
            else "Adreno 710" if "7" in processor
            else "Mali-G610" if "Dimensity" in processor
            else "Mali-G57" if tier == 1
            else "Mali-G52"
        ),
        # Memory
        ram_gb=ram,
        ram_type=ram_type,
        storage_gb=storage,
        storage_type=storage_type,
        usb_otg=True,
        # Camera (main)
        camera_setup="Triple" if tier >= 2 else "Dual" if tier == 1 else "Single",
        camera_resolution_mp=camera_mp,
        camera_resolution_detail=(
            f"{camera_mp} MP (main) + ultrawide + macro" if tier >= 1
            else f"{camera_mp} MP main"
        ),
        camera_aperture="f/1.8",
        camera_sensor=(
            "Sony IMX989" if tier == 3 and camera_mp == 50
            else "Samsung ISOCELL HP3" if camera_mp == 200
            else "Sony IMX"
        ),
        camera_sensor_size="1/1.5\"" if tier >= 2 else "1/2.0\"",
        camera_focal_length="23mm",
        camera_autofocus=True,
        camera_ois=(tier >= 2),
        camera_eis=True,
        camera_flash="LED Flash",
        camera_image_resolution=f"{camera_mp * 320}x{camera_mp * 240} Pixels",
        camera_settings="Exposure compensation, ISO control, HDR",
        camera_zoom=("3x optical" if tier == 3 else "10x digital"),
        camera_shooting_modes="Continuous Shooting, HDR, Burst, Panorama",
        camera_features="AI scene detection, Night mode, Portrait",
        camera_video_resolution=(
            "8K@24fps, 4K@60fps" if tier == 3
            else "4K@30fps" if tier >= 1
            else "1080p@30fps"
        ),
        camera_video_fps="30 fps",
        # Selfie
        front_camera_setup="Single",
        front_camera_mp=front_mp if front_mp >= 5 else 8,
        front_camera_aperture="f/2.4",
        front_camera_autofocus=(tier >= 2),
        front_camera_flash=False,
        front_camera_video_resolution="4K@30fps" if tier >= 2 else "1080p@30fps",
        front_camera_features="HDR, Portrait",
        # Design
        height_mm=Decimal(str(160.0)),
        width_mm=Decimal(str(74.0)),
        thickness_mm=Decimal(str(8.0)),
        weight_g=190 + (tier * 4),
        build_material=(
            "Glass front (Gorilla Glass), aluminum frame, glass back"
            if tier >= 2
            else "Plastic back, plastic frame"
        ),
        ip_rating=("IP68" if tier >= 3 else "IP53" if tier >= 1 else "—"),
        waterproof=("Water resistant (1.5m for 30 min)" if tier >= 3 else ""),
        ruggedness="Dust proof" if tier >= 3 else "",
        form_factor="Touch",
        # Battery
        battery_type="Li-Po (Lithium Polymer)",
        battery_mah=battery,
        wireless_charging=("50W wireless" if tier == 3 else "—"),
        quick_charging=f"{charging}W fast charging",
        charging_watts=charging,
        battery_placement="Non-removable",
        usb_type="USB Type-C 2.0" if tier <= 1 else "USB Type-C 3.2",
        # Network
        has_5g=has_5g,
        has_4g=True,
        has_3g=True,
        has_2g=True,
        network_bands=(
            "5G SA/NSA, LTE FDD/TDD, WCDMA, GSM"
            if has_5g else "LTE FDD/TDD, WCDMA, GSM"
        ),
        sim_slot="Dual SIM, Nano-SIM",
        sim_size="SIM1: Nano, SIM2: Nano",
        edge=True,
        gprs=True,
        volte=True,
        network_speed="HSPA, LTE, 5G" if has_5g else "HSPA, LTE",
        wlan="Wi-Fi 802.11 a/b/g/n/ac/ax, dual-band",
        bluetooth="v5.3, A2DP, LE" if tier >= 2 else "v5.0, A2DP, LE",
        gps="A-GPS, GLONASS, BDS, GALILEO",
        nfc=(tier >= 2 or brand == "Apple"),
        infrared=False,
        wifi_hotspot=True,
        # Sensors
        fingerprint_sensor=True,
        fingerprint_position=("On-screen" if tier >= 2 else "Side-mounted"),
        fingerprint_type=("Ultrasonic" if brand == "Apple" and tier == 3 else "Optical"),
        face_unlock=True,
        sensors_list=(
            "Accelerometer, Gyro, Proximity, Compass, Barometer, Ambient light"
            if tier >= 2 else
            "Accelerometer, Proximity, Compass, Ambient light"
        ),
        # Multimedia
        loudspeaker=True,
        audio_jack="USB Type-C" if tier >= 1 else "3.5mm",
        audio_features="Dolby Atmos" if tier >= 2 else "",
        video_formats="MP4, M4V, MKV, AVI, WEBM, 3GP",
        # Flags
        is_gaming=is_gaming,
        is_camera_flagship=is_camera_flagship,
        is_budget_friendly=is_budget,
        is_best_value=is_best_value,
        is_trending=is_trending,
    )


def _build_rating(phone, price):
    (
        brand, name, year, tier, ram, storage, camera_mp, front_mp, battery,
        charging, has_5g, refresh, display_in, processor, _,
    ) = phone
    base = 6.5 + (tier * 1.0)
    camera_score = Decimal(str(min(10.0, base + (1.5 if camera_mp >= 200 else 0.5 if camera_mp >= 50 else 0))))
    performance_score = Decimal(str(min(10.0, base + 0.5)))
    display_score = Decimal(str(min(10.0, base + 0.3)))
    battery_score = Decimal(str(min(10.0, base + (1.0 if battery >= 5000 else 0))))
    design_score = Decimal(str(min(10.0, base + 0.2)))
    software_score = Decimal(str(min(10.0, base + 0.3)))
    connectivity_score = Decimal(str(min(10.0, base + (0.5 if has_5g else 0))))
    value_score = Decimal(str(min(10.0, base + (1.5 if price < 400 else 0.5 if price < 800 else 0))))

    return dict(
        design_score=design_score,
        display_score=display_score,
        performance_score=performance_score,
        camera_score=camera_score,
        battery_score=battery_score,
        software_score=software_score,
        connectivity_score=connectivity_score,
        value_score=value_score,
        pros=[
            f"Excellent {processor} performance",
            f"Vibrant {display_in}\" display @ {refresh}Hz",
            f"{camera_mp}MP main camera captures crisp detail",
            f"{battery}mAh battery with {charging}W fast charging",
            *(
                ["Flagship-grade 5G connectivity"]
                if has_5g else []
            ),
        ][:5],
        cons=[
            "No charger included in the box",
            *(
                ["Heavier than average"]
                if tier == 3 else []
            ),
            *(
                ["Average low-light selfies"]
                if front_mp < 16 else []
            ),
        ][:3],
        verdict=(
            f"The {name} is a {['budget', 'mid-range', 'high-end', 'flagship'][tier]} "
            f"phone that delivers strong performance and a polished experience. "
            f"Best suited for users who want a reliable daily driver with a great display "
            f"and capable camera system."
        ),
    )


def _make_colors(name: str) -> list:
    return random.choice([
        [{"name": "Midnight Black", "hex": "#1a1a1a"}],
        [{"name": "Starlight", "hex": "#f5e9c9"}],
        [{"name": "Sky Blue", "hex": "#7ec0ee"}],
        [{"name": "Forest Green", "hex": "#228b22"}],
        [
            {"name": "Midnight Black", "hex": "#1a1a1a"},
            {"name": "Glacier Blue", "hex": "#7ec0ee"},
            {"name": "Pearl White", "hex": "#f5e9c9"},
        ],
    ])


class Command(BaseCommand):
    help = "Seed MobileHub with 100+ phones across 25+ brands."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset", action="store_true",
            help="Delete existing products (and dependent specs/ratings) first.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            self.stdout.write("Wiping existing products, specs, ratings…")
            ProductRating.objects.all().delete()
            ProductSpec.objects.all().delete()
            Product.objects.all().delete()
            Brand.objects.all().delete()

        # --- Brands ---
        brand_objs = {}
        for name, country, logo_slug in BRANDS:
            slug = _slug(name)
            obj, _ = Brand.objects.update_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "country": country,
                    "logo": f"{UNSPLASH}{logo_slug}?w=160&q=80",
                },
            )
            brand_objs[name] = obj
        self.stdout.write(self.style.SUCCESS(f"  Brands: {len(brand_objs)}"))

        # --- Products ---
        created = 0
        skipped = 0
        for idx, phone in enumerate(PHONES):
            (
                brand_name, pname, year, tier, ram, storage, camera_mp, front_mp,
                battery, charging, has_5g, refresh, display_in, processor, price,
            ) = phone
            brand = brand_objs[brand_name]

            # Slight stock variation per product
            stock = random.randint(5, 80)
            # Discount 5–20% on most, 0 for some
            if random.random() < 0.7 and tier <= 2:
                original_price = round(price * random.uniform(1.05, 1.25), 0)
            else:
                original_price = price

            defaults = {
                "description": (
                    f"The {pname} by {brand_name} combines premium craftsmanship, "
                    f"a {display_in}\" {refresh}Hz display, the {processor} chip, "
                    f"and a {camera_mp}MP camera for an excellent all-round experience."
                ),
                "short_description": (
                    f"{brand_name} {pname} · {processor} · {ram}GB / {storage}GB · "
                    f"{camera_mp}MP · {battery}mAh"
                ),
                "highlights": [
                    f"{display_in}\" {refresh}Hz display",
                    f"{processor} chipset",
                    f"{camera_mp}MP main camera",
                    f"{battery}mAh battery with {charging}W fast charging",
                ],
                "price": Decimal(str(price)),
                "original_price": Decimal(str(original_price)),
                "stock": stock,
                "images": [_make_image(brand_name, idx)],
                "is_active": True,
                "is_featured": False,
                "is_new_arrival": year >= 2024,
                "rating_avg": Decimal(str(round(random.uniform(4.0, 4.9), 2))),
                "review_count": random.randint(20, 500),
                "expert_rating": Decimal(str(round(6.0 + tier * 0.9 + random.random() * 0.5, 2))),
                "release_date": date(2024, 6, 1) + timedelta(days=idx * 3) - timedelta(days=(2024 - year) * 365),
                "market_status": "available",
                "made_by": (
                    "USA" if brand_name == "Apple" else
                    "South Korea" if brand_name == "Samsung" else
                    "China"
                ),
                "announced": date(year, 1, 15) + timedelta(days=(idx % 12) * 30),
                "variants": [
                    {"label": f"{ram}GB + {storage}GB", "ram_gb": ram, "storage_gb": storage, "price": float(price)},
                ],
                "colors": _make_colors(pname),
                "storage_options": [
                    {"gb": storage, "price_delta": 0},
                ],
            }

            p, was_created = Product.objects.update_or_create(
                brand=brand,
                name=pname,
                defaults=defaults,
            )
            if was_created:
                created += 1
            else:
                skipped += 1

            # --- Spec ---
            ProductSpec.objects.update_or_create(
                product=p,
                defaults=_build_spec(phone, price),
            )

            # --- Rating breakdown ---
            ProductRating.objects.update_or_create(
                product=p,
                defaults=_build_rating(phone, price),
            )

        total = Product.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f"  Products: +{created} new, {skipped} updated → {total} total"
        ))
        self.stdout.write(self.style.SUCCESS(
            f"  Brands : {Brand.objects.count()} total"
        ))

        # --- Summary table ---
        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO("  Catalog breakdown:"))
        for b in Brand.objects.annotate(num=Count("products")).order_by("name"):
            self.stdout.write(f"    {b.name:<20} {b.num:>3} phones")
        self.stdout.write("")
