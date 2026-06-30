from django.db.models import Avg, Count, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.orders.models import Order
from django.contrib.auth import get_user_model

from .filters import ProductFilter
from .models import Brand, HeroFeature, Product, ProductSpec, Review
from .serializers import (
    BrandSerializer,
    HeroFeatureSerializer,
    ProductDetailSerializer,
    ProductListSerializer,
    ReviewSerializer,
)


class ProductViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Product.objects.filter(is_active=True).select_related("brand", "spec")
    permission_classes = (permissions.AllowAny,)
    filter_backends = (DjangoFilterBackend,)
    filterset_class = ProductFilter

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProductDetailSerializer
        return ProductListSerializer

    def get_object(self):
        # Allow lookup by slug
        lookup = self.kwargs.get(self.lookup_field or "pk")
        return generics.get_object_or_404(self.queryset, slug=lookup)

    def get_queryset(self):
        qs = super().get_queryset()
        sort = self.request.query_params.get("sort")
        if sort == "price_asc":
            qs = qs.order_by("price")
        elif sort == "price_desc":
            qs = qs.order_by("-price")
        elif sort == "newest":
            qs = qs.order_by("-created_at")
        elif sort == "popular":
            qs = qs.order_by("-review_count", "-rating_avg")
        return qs

    @action(detail=False, methods=["get"], url_path="brands")
    def brands(self, request):
        data = BrandSerializer(Brand.objects.all(), many=True).data
        return Response(data)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Live counts shown on the home-page hero strip.

        All counts reflect only active/published records so the marketing
        numbers don't drift from what users can actually browse.
        `customers` is the total number of registered accounts.
        """
        User = get_user_model()
        products = self.get_queryset().count()
        brands = Brand.objects.count()
        customers = User.objects.count()
        return Response(
            {"phones": products, "brands": brands, "customers": customers}
        )

    @action(detail=False, methods=["get"], url_path="featured")
    def featured(self, request):
        """Trending + Best Deal products + admin-picked hero product."""
        trending = (
            self.get_queryset()
            .filter(spec__is_trending=True)
            .order_by("-rating_avg")[:6]
        )
        deals = (
            self.get_queryset()
            .filter(original_price__gt=0)
            .extra(select={"discount": "(price - original_price) / original_price * -1"})
            .order_by("-discount")[:6]
        )
        hero = self._get_hero_payload()
        return Response(
            {
                "hero": hero,
                "trending": ProductListSerializer(trending, many=True).data,
                "best_deals": ProductListSerializer(deals, many=True).data,
            }
        )

    @action(detail=False, methods=["get"], url_path="hero")
    def hero(self, request):
        """Return just the active hero product (or null)."""
        return Response(self._get_hero_payload())

    def _get_hero_payload(self):
        """Resolve the active HeroFeature singleton into a public payload."""
        hero = HeroFeature.objects.filter(is_active=True).select_related("product").first()
        if not hero or not hero.product:
            return None
        data = HeroFeatureSerializer(hero).data
        return data

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="reviews",
        permission_classes=(permissions.AllowAny,),
    )
    def reviews(self, request, pk=None):
        product = self.get_object()
        if request.method == "GET":
            qs = product.reviews.select_related("user").order_by("-created_at")
            return Response(ReviewSerializer(qs, many=True).data)

        if not request.user.is_authenticated:
            raise PermissionDenied("Authentication required to submit a review.")
        if Review.objects.filter(product=product, user=request.user).exists():
            return Response(
                {"detail": "You have already reviewed this product."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(product=product, user=request.user)
        # Recompute aggregates
        agg = product.reviews.aggregate(avg=Avg("rating"), n=Count("id"))
        product.rating_avg = agg["avg"] or 0
        product.review_count = agg["n"] or 0
        product.save(update_fields=["rating_avg", "review_count"])
        return Response(serializer.data, status=status.HTTP_201_CREATED)