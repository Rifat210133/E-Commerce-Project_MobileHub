from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import EmailOTP, UserProfile

User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    # Surface the *live* computed tier instead of the stored column so the
    # frontend doesn't have to re-derive it from orders. The DB field
    # `membership_tier` is still writable via UpdateProfileSerializer so
    # admins can pin specific customers to a tier.
    membership_tier = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = (
            "phone_number",
            "avatar",
            "membership_tier",
            "address_line1",
            "city",
            "state",
            "division",
            "district",
            "upazila",
            "postal_code",
            "country",
            "address_book",
            "created_at",
        )
        read_only_fields = ("created_at",)

    def get_membership_tier(self, obj: UserProfile) -> str:
        return obj.computed_tier


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    is_admin = serializers.SerializerMethodField()
    # `date_joined` is when the auth row was created. We expose it as
    # `joined_at` so the frontend can show a stable "Member since" date
    # without us having to overwrite Django's internal timestamp.
    joined_at = serializers.DateTimeField(source="date_joined", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_admin",
            "joined_at",
            "profile",
        )

    def get_is_admin(self, obj: User) -> bool:
        return obj.is_staff


class RequestRegisterOTPSerializer(serializers.Serializer):
    """Validates the email used to request a registration OTP."""

    email = serializers.EmailField(required=True)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


def _hash_code(code: str) -> str:
    """Stable hash we store instead of the raw OTP."""
    import hashlib
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


class VerifyRegisterOTPSerializer(serializers.Serializer):
    """Validates email + 6-digit OTP pair during the verify step.

    Always returns success/failure in the same shape so an attacker can't
    tell whether the email was already used. The actual uniqueness check
    happens during account creation.
    """

    email = serializers.EmailField(required=True)
    code = serializers.RegexField(
        regex=r"^\d{6}$",
        required=True,
        error_messages={"invalid": "Enter the 6-digit code from your email."},
    )

    def validate(self, attrs):
        from .otp import consume_register_otp

        email = attrs["email"].strip().lower()
        # We *intentionally* always invoke the same path so timing/result
        # shape doesn't leak whether an OTP was ever sent. The helper returns
        # (ok, debug_error) — the public response only surfaces ok.
        ok, _reason = consume_register_otp(email, attrs["code"])
        if not ok:
            raise serializers.ValidationError(
                {"code": "That code is invalid, expired, or already used."}
            )
        attrs["email"] = email
        return attrs


class RegisterSerializer(serializers.ModelSerializer):
    """Public registration — requires a verified OTP for the chosen email.

    The client is expected to first call ``POST /api/auth/register/otp/`` with
    the email, then post this serializer with the same email + the 6-digit
    code from that email. The OTP is consumed during ``validate`` so the same
    code can never be re-used to register twice.
    """

    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)
    otp_code = serializers.RegexField(
        regex=r"^\d{6}$",
        write_only=True,
        required=True,
        error_messages={"invalid": "Enter the 6-digit code sent to your email."},
    )

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "first_name",
            "last_name",
            "password",
            "password_confirm",
            "otp_code",
        )

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        email = attrs["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            # Re-use the same shape as the OTP-verify path so callers can't
            # tell apart "email already used" from "OTP invalid".
            raise serializers.ValidationError(
                {"otp_code": "That code is invalid, expired, or already used."}
            )

        from .otp import consume_register_otp

        ok, _reason = consume_register_otp(email, attrs.pop("otp_code"))
        if not ok:
            raise serializers.ValidationError(
                {"otp_code": "That code is invalid, expired, or already used."}
            )

        attrs["email"] = email
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
    division = serializers.CharField(required=False, allow_blank=True, max_length=60)
    district = serializers.CharField(required=False, allow_blank=True, max_length=80)
    upazila = serializers.CharField(required=False, allow_blank=True, max_length=80)
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
            "division",
            "district",
            "upazila",
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
        "division",
        "district",
        "upazila",
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
