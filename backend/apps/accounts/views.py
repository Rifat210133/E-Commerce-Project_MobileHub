from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import get_connection
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
AuthTokenPairSerializer,
RegisterSerializer,
UpdateProfileSerializer,
UserSerializer,
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/"""

    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            AuthTokenPairSerializer.for_user(user), status=status.HTTP_201_CREATED
        )


class LoginView(APIView):
    """POST /api/auth/login/ — returns JWT pair + user."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        identifier = request.data.get("email") or request.data.get("username")
        secret = request.data.get("password")
        if not identifier or not secret:
            return Response(
                {"detail": "Email/username and credentials are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Allow login by email or username
        user = None
        if "@" in identifier:
            user_obj = User.objects.filter(email_iexact=identifier).first()
            if user_obj:
                user = authenticate(
                    request, username=user_obj.username, password=secret
            )
        else:
            user = authenticate(request, username=identifier, password=secret)

        if user is None:
            return Response(
                {"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED
        )

        return Response(AuthTokenPairSerializer.for_user(user))


class LogoutView(APIView):
    """POST /api/auth/logout/ — blacklist the refresh token."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        refresh = request.data.get("refresh")
        if not refresh:
            return Response(
                {"detail": "refresh token required"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            token = RefreshToken(refresh)
            token.blacklist()
        except (TokenError, InvalidToken):
            return Response(
                {"detail": "Invalid refresh token."}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PUT/PATCH /api/auth/me/ — Current user profile."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return UpdateProfileSerializer
        return UserSerializer

    def update(self, request, *args, **kwargs):
        # Validate and save with the write-only UpdateProfileSerializer, but
        # return the read shape (UserSerializer) so the frontend always gets
        # the full nested profile back.
        instance = self.get_object()
        write_serializer = self.get_serializer(instance, data=request.data, partial=True)
        write_serializer.is_valid(raise_exception=True)
        self.perform_update(write_serializer)
        read_serializer = UserSerializer(instance)
        return Response(read_serializer.data)


# --- Password reset -----------------------------------------------------------

class PasswordResetRequestSerializer(serializers.Serializer):
    """Validates the email used to request a reset link."""

    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Validates the new password + confirmation on the reset page."""

    new_password = serializers.CharField(required=True, write_only=True)
    new_password_confirm = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        validate_password(attrs["new_password"])
        return attrs


class PasswordResetRequestView(APIView):
    """POST /api/auth/password/reset/ — send a reset email.

    Always returns 200 even when the email isn't on file, so attackers
    can't enumerate accounts. In DEBUG mode, a real send failure surfaces
    the underlying SMTP error so misconfiguration is obvious during
    development.
    """

    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        from .emails import send_password_reset_email

        # Guard against the most common misconfiguration: SMTP backend selected
        # but no host/user/password configured. Django's SMTP backend will raise
        # an opaque "Invalid address ''" if it can't build a valid envelope, so
        # we short-circuit with an actionable message instead.
        smtp_selected = "smtp" in settings.EMAIL_BACKEND.lower()
        smtp_misconfigured = (
            smtp_selected
            and not (settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD)
        )
        if smtp_misconfigured and settings.DEBUG:
            return Response(
                {
                    "detail": (
                        "If an account exists for that email, a reset link "
                        "has been sent."
                    ),
                    "debug_error": (
                        "EMAIL_BACKEND is SMTP but EMAIL_HOST_USER or "
                        "EMAIL_HOST_PASSWORD is empty. Set them in "
                        "backend/.env (use a Gmail App Password) and restart "
                        "the server."
                    ),
                },
                status=status.HTTP_200_OK,
            )

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user and user.has_usable_password():
            try:
                # Pre-flight the SMTP connection so we get a clear error
                # *before* message construction fails halfway through.
                # This is a no-op for the console backend.
                connection = get_connection()
                connection.open()
            except Exception as exc:
                if settings.DEBUG:
                    return Response(
                        {
                            "detail": (
                                "If an account exists for that email, a "
                                "reset link has been sent."
                            ),
                            "debug_error": (
                                f"Email backend '{settings.EMAIL_BACKEND}' "
                                f"failed to open: {exc.__class__.__name__}: {exc}"
                            ),
                        },
                        status=status.HTTP_200_OK,
                    )
                # In production stay silent — never reveal mail-server details
                # to a stranger who is probing email addresses.
            try:
                send_password_reset_email(request, user)
            except Exception as exc:
                if settings.DEBUG:
                    return Response(
                        {
                            "detail": (
                                "If an account exists for that email, a "
                                "reset link has been sent."
                            ),
                            "debug_error": (
                                f"Send failed via {settings.EMAIL_BACKEND}: "
                                f"{exc.__class__.__name__}: {exc}"
                            ),
                        },
                        status=status.HTTP_200_OK,
                    )
                # Otherwise swallow — same anti-enumeration guarantee.

        return Response(
            {
                "detail": (
                    "If an account exists for that email, a reset link "
                    "has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password/reset/confirm/ — set a new password.

    Body: { uid, token, new_password, new_password_confirm }
    """

    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        uid = request.data.get("uid")
        token = request.data.get("token")
        if not uid or not token:
            return Response(
                {"detail": "uid and token are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None

        if user is None or not default_token_generator.check_token(user, token):
            return Response(
                {"detail": "This reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.set_password(serializer.validated_data["new_password"])
        user.save()

        # Any outstanding refresh tokens for this user are now stale, so
        # blacklist them all so the user is forced to re-login on every
        # device.
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken,
                OutstandingToken,
            )

            for outstanding in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=outstanding)
        except Exception:
            # Best-effort: if blacklist tables aren't migrated, don't fail
            # the password reset.
            pass

        return Response(
            {"detail": "Your password has been updated. You can now sign in."},
            status=status.HTTP_200_OK,
        )
