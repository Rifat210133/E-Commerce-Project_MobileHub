from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.products.models import Product

from .models import CompareList
from .serializers import AddToCompareSerializer, CompareListSerializer


def _get_or_create_list(user) -> CompareList:
    obj, _ = CompareList.objects.get_or_create(user=user)
    return obj


# ---------------------------------------------------------------------------
# List / detail
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def compare_list(request):
    obj = _get_or_create_list(request.user)
    return Response(CompareListSerializer(obj).data)


# ---------------------------------------------------------------------------
# Add
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def compare_add(request):
    serializer = AddToCompareSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    product_id = serializer.validated_data["product_id"]

    product = get_object_or_404(Product, pk=product_id, is_active=True)
    obj = _get_or_create_list(request.user)

    if obj.products.filter(pk=product.pk).exists():
        return Response(CompareListSerializer(obj).data)  # idempotent
    if obj.is_full():
        return Response(
            {"detail": f"Compare list is full (max {CompareList.MAX_ITEMS})."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    obj.products.add(product)
    return Response(CompareListSerializer(obj).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Remove single product
# ---------------------------------------------------------------------------
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def compare_remove(request, product_id: int):
    obj = _get_or_create_list(request.user)
    obj.products.remove(product_id)
    return Response(CompareListSerializer(obj).data)


# ---------------------------------------------------------------------------
# Clear all
# ---------------------------------------------------------------------------
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def compare_clear(request):
    obj = _get_or_create_list(request.user)
    obj.products.clear()
    return Response(CompareListSerializer(obj).data)
