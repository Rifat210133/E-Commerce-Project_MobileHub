import logging
from datetime import timedelta
from decimal import Decimal

import requests
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.products.models import Product
from apps.products.serializers import ProductListSerializer

from .models import YouTubeCache

logger = logging.getLogger(__name__)

CACHE_TTL = timedelta(hours=24)
YOUTUBE_ENDPOINT = "https://www.googleapis.com/youtube/v3/search"

# (field_on, label, category, value)
# `field_on` is either "product" or "spec" – specifies where the boolean lives.
USE_CASE_TO_TAG = [
    ("spec", "is_gaming", "Best for Gaming", "gaming"),
    ("spec", "is_camera_flagship", "Best Camera", "camera"),
    ("spec", "is_best_value", "Best Value", "value"),
    ("spec", "is_trending", "Trending", "trending"),
]


# ---------------------------------------------------------------------------
# AI Picks
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def ai_picks(request):
    """Return one curated phone per capability category."""
    picks = []
    seen = set()
    base = Product.objects.filter(is_active=True).select_related("brand", "spec")

    for source, field, label, key in USE_CASE_TO_TAG:
        qs = base
        if source == "spec":
            qs = qs.filter(**{f"spec__{field}": True})
        else:
            qs = qs.filter(**{field: True})
        product = qs.order_by("-rating_avg", "-review_count").first()
        if not product:
            product = base.order_by("-rating_avg", "-is_featured").first()
        if not product or product.id in seen:
            continue
        seen.add(product.id)
        data = ProductListSerializer(product).data
        data["label"] = label
        data["category"] = key
        picks.append(data)

    # Always pad with a featured product if we have < 4
    if len(picks) < 4:
        for p in base.exclude(id__in=seen).order_by("-is_featured", "-rating_avg")[: 4 - len(picks)]:
            data = ProductListSerializer(p).data
            data["label"] = "Editor's Pick"
            data["category"] = "editor"
            picks.append(data)
            seen.add(p.id)

    return Response(picks)


# ---------------------------------------------------------------------------
# YouTube
# ---------------------------------------------------------------------------
def _build_query(params) -> str:
    """Compose a YouTube search query from the caller's filter parameters.

    Accepts both the rec-page vocabulary (``brand``, ``use_case``, ``specs``)
    and a richer set of catalog-page filters (price band, RAM/storage, camera,
    battery, capability & tag toggles). Catalog inputs are translated into a
    ``use_case`` / ``specs`` string so YouTube returns videos that actually
    match what the shopper filtered for.
    """
    parts = []
    brand = params.get("brand")
    if brand:
        parts.append(brand)

    # --- 1. Catalog → use_case (chip toggles translate to intent words) ---
    catalog_use_case = None
    if params.get("is_gaming") in ("true", True):
        catalog_use_case = "gaming"
    elif params.get("is_camera_flagship") in ("true", True):
        catalog_use_case = "camera"
    elif params.get("is_trending") in ("true", True):
        catalog_use_case = "flagship"
    elif params.get("is_best_value") in ("true", True):
        catalog_use_case = "mid-range"
    elif params.get("is_budget_friendly") in ("true", True):
        catalog_use_case = "budget"
    elif params.get("has_5g") in ("true", True):
        catalog_use_case = "5G"

    # --- 2. Catalog → specs (numeric thresholds translate to spec phrases) ---
    spec_bits = []
    pmax = params.get("price_max")
    pmin = params.get("price_min")
    if pmax and pmin:
        spec_bits.append(f"{pmin}-{pmax} dollar")
    elif pmax:
        spec_bits.append(f"under {pmax} dollar")
    elif pmin:
        spec_bits.append(f"over {pmin} dollar")

    ram = params.get("ram_min") or params.get("ram")
    if ram:
        spec_bits.append(f"{ram}GB RAM")

    storage = params.get("storage_min") or params.get("storage")
    if storage:
        spec_bits.append(f"{storage}GB storage")

    battery = params.get("battery_min")
    if battery:
        spec_bits.append(f"{battery}mAh battery")

    camera = params.get("camera_min")
    if camera:
        spec_bits.append(f"{camera}MP camera")

    refresh = params.get("refresh_rate_min")
    if refresh:
        spec_bits.append(f"{refresh}Hz display")

    if params.get("has_wireless_charging") in ("true", True):
        spec_bits.append("wireless charging")
    if params.get("is_waterproof") in ("true", True):
        spec_bits.append("waterproof")

    # --- 3. Final assembly: prefer the explicit use_case/specs args when
    #        passed (recs page), otherwise derive from catalog inputs. ---
    use_case = params.get("use_case") or catalog_use_case
    specs = params.get("specs") or " ".join(spec_bits).strip()

    if use_case:
        parts.append(f"best {use_case} phone review")
    elif specs:
        parts.append(f"{specs} phone review")
    else:
        parts.append("best smartphone review 2024")
    return " ".join(parts).strip()


def _fetch_youtube(query: str) -> list[dict]:
    api_key = settings.YOUTUBE_API_KEY
    if not api_key:
        # Gracefully return an empty list when no API key is configured so the
        # frontend can render without breaking. Logged for operator awareness.
        logger.warning("YOUTUBE_API_KEY not set – returning no videos for %r", query)
        return []

    try:
        resp = requests.get(
            YOUTUBE_ENDPOINT,
            params={
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": 4,
                "key": api_key,
            },
            timeout=6,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("YouTube API call failed: %s", exc)
        return []

    items = resp.json().get("items", [])
    out = []
    for item in items:
        snippet = item.get("snippet", {})
        vid = item.get("id", {}).get("videoId")
        if not vid:
            continue
        out.append(
            {
                "videoId": vid,
                "title": snippet.get("title", ""),
                "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url")
                or snippet.get("thumbnails", {}).get("default", {}).get("url"),
                "channelName": snippet.get("channelTitle", ""),
                "publishedAt": snippet.get("publishedAt", ""),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Filter-based recommendation engine
# ---------------------------------------------------------------------------
def _parse_bool(value: str | None) -> bool | None:
    """Parse a query-string bool into True/False/None (unknown)."""
    if value is None:
        return None
    v = str(value).strip().lower()
    if v in {"1", "true", "yes", "on"}:
        return True
    if v in {"0", "false", "no", "off"}:
        return False
    return None


def _parse_decimal(value, default=None):
    if value in (None, ""):
        return default
    try:
        return Decimal(str(value))
    except Exception:
        return default


def _parse_int(value, default=None):
    if value in (None, ""):
        return default
    try:
        return int(value)
    except Exception:
        return default


@api_view(["GET"])
@permission_classes([AllowAny])
def suggest(request):
    """
    Budget / use-case based recommender.

    Query params (all optional):
      budget           - max price ceiling (e.g. 50000)
      budget_currency  - display only, default "BDT"
      use_case         - "gaming" | "camera" | "value" | "trending" | "budget"
      brands           - comma separated brand slugs or names
      processor        - free text, icontains match
      chipset          - free text, icontains match
      ram_min          - minimum RAM in GB
      storage_min      - minimum storage in GB
      battery_min      - minimum battery mAh
      refresh_min      - minimum refresh rate (Hz)
      has_5g           - true / false
      has_nfc          - true / false
      in_stock         - true / false
      limit            - max results (default 12, capped 50)
    """
    params = request.query_params

    qs = Product.objects.filter(is_active=True).select_related("brand", "spec")

    budget = _parse_decimal(params.get("budget"))
    if budget is not None:
        qs = qs.filter(price__lte=budget)

    brands = params.get("brands")
    if brands:
        tokens = [b.strip() for b in brands.split(",") if b.strip()]
        if tokens:
            q = Q()
            for token in tokens:
                q |= Q(brand__slug__iexact=token) | Q(brand__name__iexact=token)
            qs = qs.filter(q)

    use_case = (params.get("use_case") or "").strip().lower() or None
    use_case_flags = {
        "gaming": "is_gaming",
        "camera": "is_camera_flagship",
        "value": "is_best_value",
        "trending": "is_trending",
        "budget": "is_budget_friendly",
    }

    processor = params.get("processor")
    if processor:
        qs = qs.filter(
            Q(spec__processor__icontains=processor)
            | Q(spec__chipset__icontains=processor)
        )

    chipset = params.get("chipset")
    if chipset:
        qs = qs.filter(spec__chipset__icontains=chipset)

    ram_min = _parse_int(params.get("ram_min"))
    if ram_min is not None:
        qs = qs.filter(spec__ram_gb__gte=ram_min)

    storage_min = _parse_int(params.get("storage_min"))
    if storage_min is not None:
        qs = qs.filter(spec__storage_gb__gte=storage_min)

    battery_min = _parse_int(params.get("battery_min"))
    if battery_min is not None:
        qs = qs.filter(spec__battery_mah__gte=battery_min)

    refresh_min = _parse_int(params.get("refresh_min"))
    if refresh_min is not None:
        qs = qs.filter(spec__refresh_rate_hz__gte=refresh_min)

    has_5g = _parse_bool(params.get("has_5g"))
    if has_5g is True:
        qs = qs.filter(spec__has_5g=True)
    elif has_5g is False:
        qs = qs.filter(spec__has_5g=False)

    has_nfc = _parse_bool(params.get("has_nfc"))
    if has_nfc is True:
        qs = qs.filter(spec__nfc=True)

    in_stock = _parse_bool(params.get("in_stock"))
    if in_stock is True:
        qs = qs.filter(stock__gt=0)

    qs = qs.distinct()

    # ---- Scoring ----------------------------------------------------------
    use_case_field = use_case_flags.get(use_case) if use_case else None

    scored = []
    for product in qs:
        spec = getattr(product, "spec", None)
        score = 0.0
        reasons = []

        # Expert rating (0..10) — heaviest weight
        er = float(product.expert_rating or 0)
        if er:
            score += er * 6
            if er >= 8.5:
                reasons.append("Expert rating ≥ 8.5")

        # User rating (0..5)
        ru = float(product.rating_avg or 0)
        if ru:
            score += ru * 4

        # Use-case flag match
        if use_case_field and spec and getattr(spec, use_case_field, False):
            score += 25
            label_map = {
                "is_gaming": "Tagged for gaming",
                "is_camera_flagship": "Camera flagship",
                "is_best_value": "Best value pick",
                "is_trending": "Trending now",
                "is_budget_friendly": "Budget friendly",
            }
            reasons.append(label_map[use_case_field])

        # Processor emphasis — flagship-tier chipsets get bonus
        if spec and spec.chipset:
            chipset_l = spec.chipset.lower()
            flagship_tokens = [
                "snapdragon 8 gen 3",
                "snapdragon 8 gen 2",
                "snapdragon 8+ gen 1",
                "snapdragon 8 elite",
                "dimensity 9300",
                "dimensity 9200",
                "apple a17",
                "apple a18",
                "apple a16",
                "tensor g3",
                "tensor g4",
                "exynos 2400",
            ]
            if any(tok in chipset_l for tok in flagship_tokens):
                score += 12
                reasons.append("Flagship chipset")

        # RAM ≥ 8 GB bonus
        if spec and spec.ram_gb:
            if spec.ram_gb >= 12:
                score += 8
                reasons.append(f"{spec.ram_gb} GB RAM")
            elif spec.ram_gb >= 8:
                score += 4

        # Battery ≥ 5000 mAh bonus
        if spec and spec.battery_mah:
            if spec.battery_mah >= 5500:
                score += 5
            elif spec.battery_mah >= 5000:
                score += 3

        # Refresh rate ≥ 90 Hz
        if spec and spec.refresh_rate_hz and spec.refresh_rate_hz >= 90:
            score += 3
            if spec.refresh_rate_hz >= 120:
                score += 2
                reasons.append(f"{spec.refresh_rate_hz} Hz display")

        # 5G / NFC compatibility bonus
        if spec and spec.has_5g:
            score += 2
        if spec and spec.nfc:
            score += 1

        # Featured / trending editorial lift
        if product.is_featured:
            score += 4
        if spec and spec.is_trending:
            score += 3

        # Budget headroom — closer to but under the budget is slightly rewarded
        if budget is not None and budget > 0 and product.price:
            ratio = float(product.price) / float(budget)
            if 0.55 <= ratio <= 0.95:
                score += 5
            elif ratio < 0.4:
                score += 1

        # Stock penalty for unavailable items (out of stock)
        if product.stock == 0:
            score -= 10

        scored.append((score, reasons, product))

    scored.sort(key=lambda t: (t[0], float(t[2].expert_rating or 0), float(t[2].rating_avg or 0)), reverse=True)

    limit = _parse_int(params.get("limit"), default=12) or 12
    limit = max(1, min(limit, 50))

    top = scored[:limit]
    payload = []
    for score, reasons, product in top:
        data = ProductListSerializer(product).data
        data["match_score"] = round(score, 1)
        data["reasons"] = reasons[:4]
        payload.append(data)

    return Response({
        "count": len(payload),
        "total_candidates": len(scored),
        "criteria": {
            "budget": str(budget) if budget is not None else None,
            "budget_currency": params.get("budget_currency") or "BDT",
            "use_case": use_case,
            "brands": brands.split(",") if brands else [],
            "processor": processor,
            "chipset": chipset,
            "ram_min": ram_min,
            "storage_min": storage_min,
            "battery_min": battery_min,
            "refresh_min": refresh_min,
            "has_5g": has_5g,
            "has_nfc": has_nfc,
            "in_stock": in_stock,
        },
        "results": payload,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def facets(request):
    """Expose facet values the recommendation UI can render as chips."""
    brands = list(
        Product.objects.filter(is_active=True)
        .values_list("brand__name", "brand__slug")
        .distinct()
        .order_by("brand__name")
    )
    chipsets = list(
        Product.objects.filter(is_active=True)
        .exclude(spec__chipset__isnull=True)
        .exclude(spec__chipset="")
        .values_list("spec__chipset", flat=True)
        .distinct()
        .order_by("spec__chipset")
    )
    return Response({
        "brands": [{"name": n, "slug": s} for n, s in brands],
        "chipsets": chipsets,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def youtube_videos(request):
    query = _build_query(request.query_params)
    cached = YouTubeCache.objects.filter(query=query).first()
    if cached and timezone.now() - cached.cached_at < CACHE_TTL:
        return Response({"query": query, "results": cached.results, "cached": True})

    results = _fetch_youtube(query)
    if results:
        YouTubeCache.objects.update_or_create(query=query, defaults={"results": results})
    return Response({"query": query, "results": results, "cached": False})