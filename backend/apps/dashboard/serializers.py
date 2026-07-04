from rest_framework import serializers

from apps.orders.models import Order
from apps.products.models import Brand, Product, ProductRating, ProductSpec


class AdminOrderSerializer(serializers.ModelSerializer):
    customer = serializers.CharField(source="user.username", read_only=True)
    customer_email = serializers.CharField(source="user.email", read_only=True)
    payment_method = serializers.SerializerMethodField()
    is_paid = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "customer",
            "customer_email",
            "items",
            "total_amount",
            "status",
            "status_notes",
            "shipping_address",
            "payment_method",
            "paid_at",
            "paid_via",
            "is_paid",
            "estimated_arrival",
            "delivered_at",
            "received_at",
            "created_at",
            "updated_at",
        )

    def get_payment_method(self, obj):
        addr = obj.shipping_address or {}
        return (addr.get("payment_method") or "").lower()

    def get_is_paid(self, obj):
        return obj.paid_at is not None


class AdminCustomerSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    is_staff = serializers.BooleanField()
    is_active = serializers.BooleanField()
    date_joined = serializers.DateTimeField()
    # View resolves the actual tier from the related Profile.
    membership_tier = serializers.SerializerMethodField()
    order_count = serializers.IntegerField()
    lifetime_value = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)

    def get_membership_tier(self, obj):
        # Tier must come from the user's actual paid spend, not the static
        # ``Profile.membership_tier`` column — that field is only kept for
        # back-compat/admin overrides and is never written to as orders
        # get paid. ``computed_tier`` is the live, derived value (Gold at
        # ৳25,000 lifetime paid, Platinum at ৳75,000) and is what the
        # storefront + profile endpoints already show.
        profile = getattr(obj, "profile", None)
        if profile is not None and hasattr(profile, "computed_tier"):
            return profile.computed_tier.lower()
        return "standard"


class AdminProductListSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "slug",
            "name",
            "brand",
            "brand_name",
            "price",
            "original_price",
            "stock",
            "is_active",
            "is_featured",
            "is_new_arrival",
            "expert_rating",
            "rating_avg",
            "review_count",
            "image",
            "market_status",
            "release_date",
            "created_at",
        )

    def get_image(self, obj: Product):
        if obj.images:
            return obj.images[0]
        return None


class AdminProductDetailSerializer(serializers.ModelSerializer):
    """Full product detail (incl. spec + rating_breakdown) for the admin edit form."""

    brand_name = serializers.CharField(source="brand.name", read_only=True)
    brand_id = serializers.IntegerField(source="brand.id", read_only=True)
    image = serializers.SerializerMethodField()
    spec = serializers.SerializerMethodField()
    rating_breakdown = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "slug",
            "name",
            "brand",
            "brand_id",
            "brand_name",
            "description",
            "short_description",
            "highlights",
            "video_url",
            "price",
            "original_price",
            "stock",
            "images",
            "image",
            "variants",
            "colors",
            "storage_options",
            "is_active",
            "is_featured",
            "is_new_arrival",
            "expert_rating",
            "release_date",
            "announced",
            "market_status",
            "made_by",
            "rating_avg",
            "review_count",
            "spec",
            "rating_breakdown",
            "created_at",
        )

    def get_image(self, obj: Product):
        if obj.images:
            return obj.images[0]
        return None

    def get_spec(self, obj: Product):
        spec = getattr(obj, "spec", None)
        if not spec:
            return None
        from apps.products.serializers import ProductSpecSerializer
        return ProductSpecSerializer(spec).data

    def get_rating_breakdown(self, obj: Product):
        rating = getattr(obj, "rating_breakdown", None)
        if not rating:
            return None
        from apps.products.serializers import ProductRatingSerializer
        return ProductRatingSerializer(rating).data


class AdminProductWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    brand_id = serializers.IntegerField()
    description = serializers.CharField(required=False, allow_blank=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    original_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )
    stock = serializers.IntegerField(min_value=0, required=False, default=0)
    images = serializers.ListField(child=serializers.CharField(), required=False)
    is_active = serializers.BooleanField(required=False, default=True)
    is_featured = serializers.BooleanField(required=False, default=False)
    is_new_arrival = serializers.BooleanField(required=False, default=False)
    expert_rating = serializers.DecimalField(
        max_digits=4, decimal_places=2, required=False, allow_null=True
    )
    short_description = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    highlights = serializers.ListField(
        child=serializers.CharField(), required=False
    )
    video_url = serializers.URLField(required=False, allow_blank=True, default="")
    release_date = serializers.DateField(required=False, allow_null=True)
    announced = serializers.DateField(required=False, allow_null=True)
    market_status = serializers.CharField(required=False, default="available")
    made_by = serializers.CharField(required=False, allow_blank=True, default="")
    variants = serializers.ListField(child=serializers.DictField(), required=False)
    colors = serializers.ListField(child=serializers.DictField(), required=False)
    storage_options = serializers.ListField(
        child=serializers.DictField(), required=False
    )
    spec = serializers.DictField(required=False)
    rating_breakdown = serializers.DictField(required=False)

    def validate_brand_id(self, value):
        if not Brand.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Brand not found.")
        return value

    def _apply_dict(self, obj, data: dict):
        for k, v in data.items():
            if hasattr(obj, k):
                setattr(obj, k, v)

    def create(self, validated_data):
        spec_data = validated_data.pop("spec", None)
        rating_data = validated_data.pop("rating_breakdown", None)
        brand = Brand.objects.get(pk=validated_data.pop("brand_id"))
        product = Product.objects.create(brand=brand, **validated_data)
        if spec_data is not None:
            ProductSpec.objects.create(product=product, **spec_data)
        if rating_data is not None:
            ProductRating.objects.create(product=product, **rating_data)
        return product

    def update(self, instance, validated_data):
        spec_data = validated_data.pop("spec", None)
        rating_data = validated_data.pop("rating_breakdown", None)
        if "brand_id" in validated_data:
            instance.brand = Brand.objects.get(pk=validated_data.pop("brand_id"))
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if spec_data is not None:
            spec, _ = ProductSpec.objects.get_or_create(product=instance)
            self._apply_dict(spec, spec_data)
            spec.save()
        if rating_data is not None:
            rating, _ = ProductRating.objects.get_or_create(product=instance)
            self._apply_dict(rating, rating_data)
            rating.save()
        return instance