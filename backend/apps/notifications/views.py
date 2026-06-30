"""REST endpoints for in-app notifications.

Two parallel surfaces:

* Admin endpoints — mounted under ``/api/admin/notifications/``. Permission
  class is ``IsAdminStaff`` so only staff users can fetch / read.
* Customer endpoints — mounted under ``/api/notifications/``. Permission
  class is ``IsAuthenticated`` and queries are always scoped to
  ``request.user``.

The shape and behaviour of the two surfaces is identical so we delegate
to small shared helpers below.
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.dashboard.permissions import IsAdminStaff

from .models import Notification
from .serializers import NotificationSerializer


# ----------------------------- shared helpers -----------------------------

def _list_for_user(request):
    """Return the request user's notifications, newest first.

    Supports ``?unread=1`` (filter to unread only) and ``?limit=N`` (default
    50, hard cap 200). Always also returns ``unread_count`` so the bell can
    render its badge without a second request.
    """
    qs = Notification.objects.filter(recipient=request.user)
    if request.query_params.get("unread") in ("1", "true", "True"):
        qs = qs.filter(is_read=False)
    try:
        limit = int(request.query_params.get("limit", "50"))
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 200))
    items = list(qs.order_by("-created_at")[:limit])
    unread_count = Notification.objects.filter(
        recipient=request.user, is_read=False
    ).count()
    return Response(
        {
            "results": NotificationSerializer(items, many=True).data,
            "unread_count": unread_count,
        }
    )


def _mark_read(request, pk: int):
    """Mark a single notification as read (idempotent)."""
    notif = get_object_or_404(Notification, pk=pk, recipient=request.user)
    if not notif.is_read:
        notif.is_read = True
        notif.read_at = timezone.now()
        notif.save(update_fields=["is_read", "read_at"])
    return Response(NotificationSerializer(notif).data)


def _mark_all_read(request):
    """Bulk mark every unread notification for this user as read."""
    qs = Notification.objects.filter(recipient=request.user, is_read=False)
    updated = qs.update(is_read=True, read_at=timezone.now())
    return Response({"updated": updated})


# ----------------------------- admin surface -----------------------------

@api_view(["GET"])
@permission_classes([IsAdminStaff])
def list_notifications(request):
    """Admin bell feed."""
    return _list_for_user(request)


@api_view(["POST"])
@permission_classes([IsAdminStaff])
def mark_notification_read(request, pk: int):
    return _mark_read(request, pk)


@api_view(["POST"])
@permission_classes([IsAdminStaff])
def mark_all_read(request):
    return _mark_all_read(request)


# --------------------------- customer surface ----------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_list_notifications(request):
    """Logged-in customer's feed, scoped to request.user."""
    return _list_for_user(request)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def customer_mark_notification_read(request, pk: int):
    return _mark_read(request, pk)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def customer_mark_all_notifications_read(request):
    return _mark_all_read(request)
