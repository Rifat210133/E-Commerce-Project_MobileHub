from rest_framework import serializers

from apps.products.serializers import ProductDetailSerializer

from .models import CompareList


class CompareListSerializer(serializers.ModelSerializer):
    products = ProductDetailSerializer(many=True, read_only=True)
    count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CompareList
        fields = ("id", "products", "count", "updated_at")


class AddToCompareSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
