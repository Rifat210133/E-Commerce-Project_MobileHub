"""REST endpoints for return policies.

Two parallel surfaces:

* Admin surface (``/api/admin/return-policies/``) — full CRUD, requires
  ``IsAdminStaff``. Admins see inactive rows too.
* Customer surface (``/api/return-policies/``) — read-only, only
  ``is_active=True`` rows. Open to anyone (no login required) so the
  storefront page works for guests.
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.dashboard.permissions import IsAdminStaff

from .models import ReturnPolicy
from .serializers import ReturnPolicyPublicSerializer, ReturnPolicySerializer


# ----------------------------- admin surface -----------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAdminStaff])
def admin_return_policy_list(request):
    """List every return policy (active and inactive) or create a new one."""
    if request.method == "GET":
        qs = ReturnPolicy.objects.all().order_by("-is_active", "-updated_at")
        return Response(ReturnPolicySerializer(qs, many=True).data)

    serializer = ReturnPolicySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminStaff])
def admin_return_policy_detail(request, pk: int):
    """Read/update/delete a single return policy.

    PATCH allows partial updates so the admin's quick-toggle button can flip
    just ``is_active`` without resending every field.
    """
    policy = get_object_or_404(ReturnPolicy, pk=pk)
    if request.method == "GET":
        return Response(ReturnPolicySerializer(policy).data)

    if request.method == "DELETE":
        policy.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = ReturnPolicySerializer(policy, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAdminStaff])
def admin_return_policy_toggle(request, pk: int):
    """Flip the ``is_active`` flag on a policy without resending the rest."""
    policy = get_object_or_404(ReturnPolicy, pk=pk)
    policy.is_active = not policy.is_active
    policy.save(update_fields=["is_active", "updated_at"])
    return Response(ReturnPolicySerializer(policy).data)


# ---------------------------- customer surface ---------------------------

@api_view(["GET"])
@permission_classes([AllowAny])
def public_return_policy_list(request):
    """Return every active return policy (newest first)."""
    qs = ReturnPolicy.objects.filter(is_active=True).order_by("-updated_at")
    return Response(ReturnPolicyPublicSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_return_policy_detail(request, slug: str):
    """Return a single active return policy by slug."""
    policy = get_object_or_404(ReturnPolicy, slug=slug, is_active=True)
    return Response(ReturnPolicyPublicSerializer(policy).data)