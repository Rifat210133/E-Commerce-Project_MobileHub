from rest_framework import serializers

from .models import Brand, HeroFeature, Product, ProductRating, ProductSpec, Review


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ("id", "name", "slug", "logo", "country")


class ProductSpecSerializer(serializers.ModelSerializer):
    """Full GSM-style spec sheet."""

    class Meta:
        model = ProductSpec
        exclude = ("product",)


class ProductRatingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductRating
        exclude = ("product",)


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username", read_only=True)
    avatar = serializers.ImageField(source="user.profile.avatar", read_only=True)

    class Meta:
        model = Review
        fields = (
            "id",
            "user",
            "user_name",
            "avatar",
            "rating",
            "title",
            "comment",
            "created_at",
        )
        read_only_fields = ("user", "user_name", "avatar", "created_at")


# --------------------------------------------------------------------------- #
# Nested write serializer — admin / product create / update
# --------------------------------------------------------------------------- #
class ProductSpecWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductSpec
        fields = "__all__"


class ProductRatingWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductRating
        fields = "__all__"


# --------------------------------------------------------------------------- #
# Read serializers
# --------------------------------------------------------------------------- #
class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight payload for catalog listings."""

    brand_name = serializers.CharField(source="brand.name", read_only=True)
    brand_slug = serializers.CharField(source="brand.slug", read_only=True)
    image = serializers.SerializerMethodField()
    discount_percent = serializers.IntegerField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)
    expert_rating = serializers.DecimalField(
        max_digits=4, decimal_places=2, read_only=True
    )

    ram_gb = serializers.IntegerField(source="spec.ram_gb", read_only=True, default=0)
    storage_gb = serializers.IntegerField(source="spec.storage_gb", read_only=True, default=0)
    has_5g = serializers.BooleanField(source="spec.has_5g", read_only=True, default=False)
    is_gaming = serializers.BooleanField(source="spec.is_gaming", read_only=True, default=False)
    is_camera_flagship = serializers.BooleanField(
        source="spec.is_camera_flagship", read_only=True, default=False
    )
    is_budget_friendly = serializers.BooleanField(
        source="spec.is_budget_friendly", read_only=True, default=False
    )
    is_best_value = serializers.BooleanField(
        source="spec.is_best_value", read_only=True, default=False
    )
    is_trending = serializers.BooleanField(
        source="spec.is_trending", read_only=True, default=False
    )
    display_inches = serializers.DecimalField(
        source="spec.display_inches", max_digits=5, decimal_places=2, read_only=True, default=0
    )
    main_camera_mp = serializers.IntegerField(
        source="spec.camera_resolution_mp", read_only=True, default=0
    )
    battery_mah = serializers.IntegerField(
        source="spec.battery_mah", read_only=True, default=0
    )
    chipset = serializers.CharField(source="spec.chipset", read_only=True, default="")

    class Meta:
        model = Product
        fields = (
            "id",
            "slug",
            "name",
            "brand_name",
            "brand_slug",
            "price",
            "original_price",
            "discount_percent",
            "stock",
            "in_stock",
            "image",
            "rating_avg",
            "review_count",
            "expert_rating",
            "release_date",
            "market_status",
            "is_new_arrival",
            "is_featured",
            "ram_gb",
            "storage_gb",
            "display_inches",
            "main_camera_mp",
            "battery_mah",
            "chipset",
            "has_5g",
            "is_gaming",
            "is_camera_flagship",
            "is_budget_friendly",
            "is_best_value",
            "is_trending",
        )

    def get_image(self, obj: Product):
        if obj.images:
            return obj.images[0]
        return None


class HeroFeatureSerializer(serializers.ModelSerializer):
    """Public payload for the home-page 'Featured today' panel."""

    product = ProductListSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = HeroFeature
        fields = (
            "id",
            "product",
            "product_id",
            "eyebrow",
            "title",
            "subtitle",
            "is_active",
            "updated_at",
        )
        read_only_fields = ("id", "updated_at", "product")


class ProductDetailSerializer(ProductListSerializer):
    spec = ProductSpecSerializer(read_only=True)
    rating_breakdown = ProductRatingSerializer(read_only=True)
    reviews = ReviewSerializer(many=True, read_only=True)

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + (
            "description",
            "short_description",
            "highlights",
            "images",
            "video_url",
            "variants",
            "colors",
            "storage_options",
            "made_by",
            "announced",
            "spec",
            "rating_breakdown",
            "reviews",
        )


# --------------------------------------------------------------------------- #
# Admin write serializer (POST / PATCH / PUT)
# --------------------------------------------------------------------------- #
class ProductWriteSerializer(serializers.ModelSerializer):
    spec = ProductSpecWriteSerializer(required=False, allow_null=True)
    rating_breakdown = ProductRatingWriteSerializer(required=False, allow_null=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "slug",
            "brand",
            "description",
            "short_description",
            "highlights",
            "price",
            "original_price",
            "stock",
            "images",
            "video_url",
            "release_date",
            "market_status",
            "made_by",
            "announced",
            "variants",
            "colors",
            "storage_options",
            "is_active",
            "is_featured",
            "is_new_arrival",
            "expert_rating",
            "spec",
            "rating_breakdown",
        )
        read_only_fields = ("id",)

    def _save_nested(self, instance, spec_data, rating_data):
        if spec_data is not None:
            ProductSpec.objects.update_or_create(product=instance, defaults=spec_data)
        elif hasattr(instance, "spec"):
            # spec explicitly nulled → delete
            instance.spec.delete()
        if rating_data is not None:
            ProductRating.objects.update_or_create(
                product=instance, defaults=rating_data
            )
        elif hasattr(instance, "rating_breakdown"):
            instance.rating_breakdown.delete()

    def create(self, validated_data):
        spec_data = validated_data.pop("spec", None)
        rating_data = validated_data.pop("rating_breakdown", None)
        product = Product.objects.create(**validated_data)
        self._save_nested(product, spec_data, rating_data)
        return product

    def update(self, instance, validated_data):
        spec_data = validated_data.pop("spec", None)
        rating_data = validated_data.pop("rating_breakdown", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        self._save_nested(instance, spec_data, rating_data)
        return instance