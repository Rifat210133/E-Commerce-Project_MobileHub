from collections import OrderedDict
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.orders.models import Order, ReturnRequest
from apps.products.models import Brand, HeroFeature, Product, ProductSpec
from apps.products.serializers import HeroFeatureSerializer

from .permissions import IsAdminStaff
from .serializers import (
    AdminCustomerSerializer,
    AdminOrderSerializer,
    AdminProductDetailSerializer,
    AdminProductListSerializer,
    AdminProductWriteSerializer,
)

User = get_user_model()

VALID_STATUSES = {s for s, _ in Order.STATUS_CHOICES}


def _order_unit_price(order: Order, product_id: int) -> Decimal:
    """Return the per-unit price the parent order charged for a product.

    `ReturnRequest.items` only stores product_id + quantity_returned, so we
    look the price up from the snapshot stored on the parent Order.items
    JSONField. Falls back to 0 if the line is missing.
    """
    if not order or not getattr(order, "items", None):
        return Decimal("0")
    for line in order.items:
        if int(line.get("product_id") or 0) == int(product_id):
            try:
                return Decimal(str(line.get("price") or 0))
            except Exception:
                return Decimal("0")
    return Decimal("0")


def _refund_value(rr: ReturnRequest) -> Decimal:
    """Sum of unit_price * quantity_returned across a single return request."""
    total = Decimal("0")
    order = rr.order
    for line in (rr.items or []):
        pid = line.get("product_id")
        qty = int(line.get("quantity_returned") or 0)
        if pid is None or qty <= 0:
            continue
        total += _order_unit_price(order, int(pid)) * Decimal(qty)
    return total


def _refunds_by_day(start, end):
    """Return {date: total_refund_value} for Refunded requests decided in
    the inclusive [start, end] window. `start` and `end` are `date` objects.
    """
    q = ReturnRequest.objects.filter(
        status=ReturnRequest.STATUS_REFUNDED,
        decided_at__date__gte=start,
        decided_at__date__lte=end,
    ).select_related("order")
    out = {}
    for rr in q:
        d = rr.decided_at.date()
        out[d] = out.get(d, Decimal("0")) + _refund_value(rr)
    return out


def _total_refunded_in_window(start, end) -> Decimal:
    """Sum refund value for Refunded requests decided in [start, end]."""
    return sum(
        (
            _refund_value(rr)
            for rr in ReturnRequest.objects.filter(
                status=ReturnRequest.STATUS_REFUNDED,
                decided_at__date__gte=start,
                decided_at__date__lte=end,
            ).select_related("order")
        ),
        Decimal("0"),
    )


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdminStaff])
def analytics_overview(request):
    today = timezone.now().date()
    last_30 = today - timedelta(days=30)
    prev_30 = today - timedelta(days=60)

    # Revenue only counts orders that have actually been paid.
    # Online payments (card/paypal) are paid at checkout; COD orders are paid
    # only after admin marks them received, so unpaid COD orders stay out of
    # revenue but still appear in the orders tile.
    gross_revenue_30 = (
        Order.objects.filter(created_at__date__gte=last_30, paid_at__isnull=False)
        .exclude(status="Cancelled")
        .aggregate(total=Sum("total_amount"))["total"]
        or Decimal("0")
    )
    gross_revenue_prev = (
        Order.objects.filter(
            created_at__date__gte=prev_30,
            created_at__date__lt=last_30,
            paid_at__isnull=False,
        )
        .exclude(status="Cancelled")
        .aggregate(total=Sum("total_amount"))["total"]
        or Decimal("0")
    )

    # Refunds decrease real revenue. Match the refund value to the order
    # date (so a refund processed today against an old order counts toward
    # this 30d window, not the original order's window).
    refunded_30 = _total_refunded_in_window(last_30, today)
    refunded_prev = _total_refunded_in_window(prev_30, last_30 - timedelta(days=1))

    revenue_30 = gross_revenue_30 - refunded_30
    revenue_prev = gross_revenue_prev - refunded_prev

    refunded_count_30 = ReturnRequest.objects.filter(
        status=ReturnRequest.STATUS_REFUNDED,
        decided_at__date__gte=last_30,
        decided_at__date__lte=today,
    ).count()
    refunded_count_prev = ReturnRequest.objects.filter(
        status=ReturnRequest.STATUS_REFUNDED,
        decided_at__date__gte=prev_30,
        decided_at__date__lt=last_30,
    ).count()
    orders_30 = Order.objects.filter(created_at__date__gte=last_30).count()
    orders_prev = Order.objects.filter(
        created_at__date__gte=prev_30, created_at__date__lt=last_30
    ).count()
    users_30 = User.objects.filter(date_joined__date__gte=last_30).count()
    users_prev = User.objects.filter(
        date_joined__date__gte=prev_30, date_joined__date__lt=last_30
    ).count()

    inventory_alerts = Product.objects.filter(is_active=True, stock__lt=15).count()

    def pct(curr, prev) -> float:
        if not prev:
            return 100.0 if curr else 0.0
        return round(((curr - prev) / prev) * 100, 1)

    return Response(
        {
            "total_revenue": float(revenue_30),
            "revenue_change_pct": pct(revenue_30, revenue_prev),
            "total_orders": orders_30,
            "orders_change_pct": pct(orders_30, orders_prev),
            "active_users": users_30,
            "users_change_pct": pct(users_30, users_prev),
            "inventory_alerts": inventory_alerts,
            "gross_revenue_30d": float(gross_revenue_30),
            "total_refunded_30d": float(refunded_30),
            "refunded_requests_30d": refunded_count_30,
            "refunded_requests_change_pct": pct(refunded_count_30, refunded_count_prev),
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminStaff])
def analytics_sales(request):
    """Sales time-series for the requested range."""
    rng = request.query_params.get("range", "30d")
    days = {"7d": 7, "30d": 30, "90d": 90}.get(rng, 30)
    today = timezone.now().date()
    start = today - timedelta(days=days - 1)

    daily = (
        Order.objects.filter(created_at__date__gte=start, paid_at__isnull=False)
        .exclude(status="Cancelled")
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(revenue=Sum("total_amount"), orders=Count("id"))
        .order_by("day")
    )
    by_day = {row["day"]: row for row in daily}

    # Subtract refunds decided on each day (refunds are matched by
    # `decided_at` date, not by the original order date, so a refund issued
    # today against an old order deducts from today's revenue, matching
    # real cash flow).
    refunds_by_day = _refunds_by_day(start, today)

    series = []
    for i in range(days):
        day = start + timedelta(days=i)
        row = by_day.get(day, {"day": day, "revenue": Decimal("0"), "orders": 0})
        gross = Decimal(str(row["revenue"]))
        refund = refunds_by_day.get(day, Decimal("0"))
        net = gross - refund
        series.append(
            {
                "date": day.isoformat(),
                "revenue": float(net),
                "refunds": float(refund),
                "orders": row["orders"],
            }
        )

    return Response({"range": rng, "series": series})


@api_view(["GET"])
@permission_classes([IsAdminStaff])
def analytics_distribution(request):
    """Mock category distribution: smartphones 65, accessories 25, others 10.

    Computed dynamically so the values reflect the actual catalog size."""
    total = Product.objects.filter(is_active=True).count() or 1
    return Response(
        [
            {"name": "Smartphones", "value": 65, "count": int(total * 0.65)},
            {"name": "Accessories", "value": 25, "count": int(total * 0.25)},
            {"name": "Others", "value": 10, "count": int(total * 0.10)},
        ]
    )


# ---------------------------------------------------------------------------
# Orders management
# ---------------------------------------------------------------------------
@api_view(["GET", "PUT"])
@permission_classes([IsAdminStaff])
def admin_order_status(request, order_id: int):
    order = get_object_or_404(Order, pk=order_id)
    if request.method == "GET":
        return Response(AdminOrderSerializer(order).data)

    new_status = request.data.get("status")
    note = request.data.get("status_notes")
    if new_status not in VALID_STATUSES:
        return Response(
            {"detail": f"status must be one of {sorted(VALID_STATUSES)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    order.status = new_status
    if note is not None:
        order.status_notes = note
    order.save()
    return Response(AdminOrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([IsAdminStaff])
def admin_mark_order_paid(request, order_id: int):
    """Mark a COD order as paid. Online payments are auto-paid at checkout
    so this endpoint refuses them; once paid, the order starts contributing
    to revenue analytics."""
    order = get_object_or_404(Order, pk=order_id)
    addr = order.shipping_address or {}
    payment_method = (addr.get("payment_method") or "").lower()
    if payment_method != "cod":
        return Response(
            {"detail": "Only COD orders can be marked paid manually."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if order.paid_at is not None:
        return Response(
            {"detail": "Order is already marked as paid."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    order.paid_at = timezone.now()
    order.paid_via = "cod"
    order.save(update_fields=["paid_at", "paid_via"])
    return Response(AdminOrderSerializer(order).data)


@api_view(["GET"])
@permission_classes([IsAdminStaff])
def admin_orders(request):
    qs = Order.objects.select_related("user").order_by("-created_at")
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status__iexact=status_filter)
    start = request.query_params.get("start")
    end = request.query_params.get("end")
    if start:
        qs = qs.filter(created_at__date__gte=start)
    if end:
        qs = qs.filter(created_at__date__lte=end)
    return Response(AdminOrderSerializer(qs, many=True).data)


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdminStaff])
def admin_customers(request):
    users = (
        User.objects.annotate(
            order_count=Count("orders"),
            lifetime_value=Sum(
                "orders__total_amount",
                filter=Q(orders__status__in=["Delivered", "Shipped", "Processing", "Confirmed"]),
            ),
        )
        .order_by("-date_joined")
    )
    return Response(AdminCustomerSerializer(users, many=True).data)


# ---------------------------------------------------------------------------
# Products CRUD
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAdminStaff])
def admin_products(request):
    if request.method == "POST":
        serializer = AdminProductWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(AdminProductDetailSerializer(product).data, status=status.HTTP_201_CREATED)
    qs = Product.objects.select_related("brand", "spec").order_by("-created_at")
    return Response(AdminProductListSerializer(qs, many=True).data)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAdminStaff])
def admin_product_detail(request, pk: int):
    product = get_object_or_404(
        Product.objects.select_related("brand", "spec", "rating_breakdown"), pk=pk
    )
    if request.method == "GET":
        return Response(AdminProductDetailSerializer(product).data)
    if request.method in ("PUT", "PATCH"):
        partial = request.method == "PATCH"
        serializer = AdminProductWriteSerializer(product, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(AdminProductDetailSerializer(product).data)
    # DELETE — soft-deactivate per spec
    product.is_active = False
    product.save(update_fields=["is_active"])
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Inventory management (list-all + per-product stock update)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdminStaff])
def inventory_list(request):
    """Return every active product with current stock for the admin table."""
    qs = (
        Product.objects.filter(is_active=True)
        .select_related("brand")
        .order_by("name")
    )
    data = []
    for p in qs:
        stock = p.stock
        if stock <= 5:
            level = "critical"
        elif stock < 15:
            level = "low"
        else:
            level = "ok"
        data.append(
            {
                "id": p.id,
                "slug": p.slug,
                "name": p.name,
                "brand": p.brand.name,
                "price": float(p.price),
                "stock": stock,
                "image": p.images[0] if p.images else None,
                "level": level,
                "is_active": p.is_active,
            }
        )
    return Response(data)


@api_view(["PATCH"])
@permission_classes([IsAdminStaff])
def inventory_update_stock(request, pk: int):
    """Update the stock count of a single product."""
    product = get_object_or_404(Product, pk=pk)
    try:
        new_stock = int(request.data.get("stock", product.stock))
    except (TypeError, ValueError):
        return Response(
            {"detail": "stock must be an integer"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if new_stock < 0:
        return Response(
            {"detail": "stock cannot be negative"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    product.stock = new_stock
    product.save(update_fields=["stock"])
    return Response(
        {
            "id": product.id,
            "slug": product.slug,
            "name": product.name,
            "stock": product.stock,
        }
    )


# ---------------------------------------------------------------------------
# Inventory alerts
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAdminStaff])
def inventory_alerts(request):
    qs = (
        Product.objects.filter(is_active=True, stock__lt=15)
        .select_related("brand")
        .order_by("stock")
    )
    data = []
    for p in qs:
        stock = p.stock
        if stock <= 5:
            level = "critical"
        elif stock < 15:
            level = "low"
        else:
            level = "ok"
        data.append(
            {
                "id": p.id,
                "slug": p.slug,
                "name": p.name,
                "brand": p.brand.name,
                "price": float(p.price),
                "stock": stock,
                "image": p.images[0] if p.images else None,
                "level": level,
            }
        )
    return Response(data)


# ---------------------------------------------------------------------------
# Hero feature (singleton) — controls the home-page "Featured today" panel
# ---------------------------------------------------------------------------
@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAdminStaff])
def admin_hero_feature(request):
    """Read or update the singleton HeroFeature row (always pk=1).

    GET    → returns the current hero payload (with embedded product)
    PUT/PATCH → partial update; accepts product_id (or null), eyebrow,
                title, subtitle, is_active.
    """
    hero, _ = HeroFeature.objects.get_or_create(pk=1)

    if request.method == "GET":
        return Response(HeroFeatureSerializer(hero).data)

    partial = request.method == "PATCH"
    serializer = HeroFeatureSerializer(hero, data=request.data, partial=partial)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)
