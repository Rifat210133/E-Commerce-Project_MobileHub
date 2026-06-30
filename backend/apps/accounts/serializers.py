from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserProfile

User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = (
            "phone_number",
            "avatar",
            "membership_tier",
            "address_line1",
            "city",
            "state",
            "postal_code",
            "country",
            "address_book",
            "created_at",
        )
        read_only_fields = ("created_at",)


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_admin",
            "profile",
        )

    def get_is_admin(self, obj: User) -> bool:
        return obj.is_staff


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("username", "email", "first_name", "last_name", "password", "password_confirm")

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        if User.objects.filter(email__iexact=attrs["email"]).exists():
            raise serializers.ValidationError({"email": "An account with this email already exists."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        user = User.objects.create_user(**validated_data)
        UserProfile.objects.get_or_create(user=user)
        return user


class AuthTokenPairSerializer(serializers.Serializer):
    """Wraps the JWT pair with the serialized user."""

    user = UserSerializer(read_only=True)
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)

    @classmethod
    def for_user(cls, user: User) -> dict:
        refresh = RefreshToken.for_user(user)
        return {
            "user": UserSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }


class UpdateProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False)

    # Flat profile fields — accepted at the top level so the frontend can post
    # the same shape it uses for the read form.
    phone_number = serializers.CharField(required=False, allow_blank=True, max_length=20)
    address_line1 = serializers.CharField(required=False, allow_blank=True, max_length=200)
    city = serializers.CharField(required=False, allow_blank=True, max_length=80)
    state = serializers.CharField(required=False, allow_blank=True, max_length=80)
    postal_code = serializers.CharField(required=False, allow_blank=True, max_length=20)
    country = serializers.CharField(required=False, allow_blank=True, max_length=60)
    membership_tier = serializers.ChoiceField(
        required=False, choices=UserProfile.MEMBERSHIP_CHOICES
    )

    class Meta:
        model = User
        fields = (
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "address_line1",
            "city",
            "state",
            "postal_code",
            "country",
            "membership_tier",
        )

    def validate_email(self, value: str) -> str:
        qs = User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    PROFILE_FIELDS = (
        "phone_number",
        "address_line1",
        "city",
        "state",
        "postal_code",
        "country",
        "membership_tier",
    )

    def update(self, instance, validated_data):
        # Split profile fields from User fields. Anything in PROFILE_FIELDS goes
        # to the related UserProfile; the rest goes to the User model.
        profile_data = {}
        for field in self.PROFILE_FIELDS:
            if field in validated_data:
                profile_data[field] = validated_data.pop(field)

        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()

        if hasattr(instance, "profile"):
            for k, v in profile_data.items():
                setattr(instance.profile, k, v)
            if profile_data:
                instance.profile.save()
        elif profile_data:
            UserProfile.objects.create(user=instance, **profile_data)

        return instance
