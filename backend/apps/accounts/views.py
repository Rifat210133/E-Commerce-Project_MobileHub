from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import get_connection
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import generics, permissions, serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
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
    """POST /api/auth/register/

    Requires a valid 6-digit OTP that was previously issued via
    ``POST /api/auth/register/otp/``. The OTP is consumed atomically inside
    the serializer's ``validate`` step.
    """

    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            AuthTokenPairSerializer.for_user(user), status=status.HTTP_201_CREATED
        )


class RegisterOTPThrottle(AnonRateThrottle):
    """Rate-limit how often an anonymous caller can request a registration OTP."""

    scope = "register-otp"


class CheckEmailThrottle(AnonRateThrottle):
    """Rate-limit how often an anonymous caller can probe /auth/check-email/.

    The endpoint deliberately exposes whether an email is already
    registered so the registration UI can give a friendlier "this email
    is already in use — sign in instead" message instead of the generic
    "OTP is invalid, expired, or already used" error. That trades a
    little enumeration resistance for a much better UX for legitimate
    users who simply forgot they have an account.

    Mitigations:

    * Same throttle scope as ``register-otp`` would burn email sending
      capacity on every probe, so this one is set in
      ``DEFAULT_THROTTLE_RATES["auth-check-email"]`` (60/min per IP —
      plenty for an interactive form, hostile to bulk scraping).
    * The response is the *same shape* (just ``{"exists": bool}``)
      regardless of email validity, so timing is roughly constant.
    * Email lookups are case-insensitive and trimmed the same way
      ``RegisterSerializer`` normalises, so a guess like
      ``Foo@Example.com`` still resolves.
    """

    scope = "auth-check-email"


class CheckEmailView(APIView):
    """POST /api/auth/check-email/ — public, rate-limited existence probe.

    Body: ``{"email": "user@example.com"}``
    Response: ``{"email": "...", "exists": true|false}``

    The frontend uses this on the registration page to surface a clear
    "This email is already registered — sign in instead" message *before*
    the OTP is requested, so users who already have an account don't
    burn a verification code or hit the cryptic
    "That code is invalid, expired, or already used." error during the
    verify step.
    """

    permission_classes = (permissions.AllowAny,)
    throttle_classes = (CheckEmailThrottle,)

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response(
                {"email": "Email is required.", "exists": False},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Use Django's built-in EmailValidator rather than reinventing the
        # wheel — keeps behaviour in lock-step with the rest of the auth
        # surface.
        from django.core.exceptions import ValidationError
        from django.core.validators import validate_email

        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {"email": "Enter a valid email address.", "exists": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exists = User.objects.filter(email__iexact=email, is_active=True).exists()
        return Response({"email": email, "exists": exists})


class CheckIdentifierThrottle(AnonRateThrottle):
    """Rate-limit how often an anonymous caller can probe /auth/check-identifier/.

    Used by the login page to give a friendlier
    "no account with this email — want to register?" message instead of
    the generic "Invalid credentials." error. Same trade-off as
    ``CheckEmailThrottle`` (gives up some enumeration resistance for
    better UX), and the same rate ceiling (60/min per IP).
    """

    scope = "auth-check-identifier"


class CheckIdentifierView(APIView):
    """POST /api/auth/check-identifier/ — probe whether a *login identifier* exists.

    Body: ``{"identifier": "user@example.com"}`` (or a username).
    Response: ``{"identifier": "...", "exists": bool, "kind": "email"|"username",
                  "can_password_login": bool}``

    Used by the login page so we can distinguish:

    * No such account — surface a clear "register instead" prompt instead
      of a misleading "Invalid credentials.".
    * Account exists but has no usable password (social-only login,
      legacy placeholder, etc.) — point the user at the right recovery
      path instead of letting them type a password that can never work.
    * Account exists with a usable password — fall through to the real
      ``POST /api/auth/login/`` attempt.

    Public + rate-limited (60/min/IP — see ``CheckIdentifierThrottle``).
    """

    permission_classes = (permissions.AllowAny,)
    throttle_classes = (CheckIdentifierThrottle,)
    authentication_classes = ()  # Don't 401 anonymous probes.

    def post(self, request):
        raw = (request.data.get("identifier") or "").strip()
        if not raw:
            return Response(
                {"identifier": "Identifier is required.", "exists": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Same lookup rules as LoginView: if it has an '@' treat it as an
        # email (case-insensitive), otherwise treat it as a username
        # (case-sensitive — usernames are unique by exact match by default).
        user = None
        kind = None
        if "@" in raw:
            user = (
                User.objects.filter(email__iexact=raw, is_active=True).first()
            )
            kind = "email"
        else:
            user = User.objects.filter(username=raw, is_active=True).first()
            kind = "username"

        return Response(
            {
                "identifier": raw,
                "exists": user is not None,
                "kind": kind,
                # Mirrors PasswordResetRequestView's same check — see
                # that view for the rationale.
                "can_password_login": bool(user and user.has_usable_password()),
            }
        )


class RegisterOTPRequestView(APIView):
    """POST /api/auth/register/otp/ — send a verification code.

    Body: ``{ "email": "user@example.com" }``

    Always returns 200 with a neutral success message so attackers can't
    enumerate which emails are already registered. In DEBUG the response
    includes the freshly generated ``code`` (handy when running the
    ``console`` email backend) and a ``debug_error`` if SMTP failed.
    """

    permission_classes = (permissions.AllowAny,)
    throttle_classes = (RegisterOTPThrottle,)

    def post(self, request):
        from .serializers import RequestRegisterOTPSerializer
        from .otp import issue_register_otp

        serializer = RequestRegisterOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        result = issue_register_otp(email)

        body = {
            "detail": (
                "If that email is not already registered, a 6-digit "
                "verification code has been sent."
            )
        }
        if getattr(__import__("django").conf.settings, "DEBUG", False):
            body["sent"] = result.get("sent", False)
            if "code" in result:
                body["code"] = result["code"]
            if "debug_error" in result:
                body["debug_error"] = result["debug_error"]
        return Response(body, status=status.HTTP_200_OK)


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

        # Allow login by email or username. Built-in auth.User's `email`
        # field doesn't register an `email_iexact` shortcut, so we filter
        # with the explicit `__iexact` lookup here.
        user = None
        if "@" in identifier:
            user_obj = (
                User.objects.filter(email__iexact=identifier).first()
            )
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


class BangladeshGeoView(APIView):
    """GET /api/auth/bd-geo/ — Bangladesh division → district → upazila list.

    Public so unauthenticated checkout pages can also prefill the same
    dropdowns if we ever wire that up. The payload is a small static
    structure (8 divisions, 64 districts, ~495 upazilas) so we just hand
    it back as-is.
    """

    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()  # Don't 401 anonymous callers.

    def get(self, request):
        from .bd_geo import BD_DIVISIONS

        return Response({"divisions": BD_DIVISIONS})


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

    Returns 404 when no active user is associated with the supplied email,
    so legitimate users get immediate feedback instead of waiting for a
    link that will never come.

    NOTE on enumeration: confirming account existence is a deliberate
    product decision (better UX) and explicitly trades off some
    enumeration resistance. Mitigations in front of this view
    (rate limiting + CAPTCHA) are out of scope here.

    In DEBUG mode, a real send failure surfaces the underlying SMTP
    error so misconfiguration is obvious during development.
    """

    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        from .emails import send_password_reset_email

        user = (
            User.objects.filter(email__iexact=email, is_active=True)
            .first()
        )
        # No matching active account → tell the caller straight away.
        if user is None:
            raise NotFound(
                detail="No account is registered with this email address.",
                code="email_not_registered",
            )
        if not user.has_usable_password():
            # Social-only / unusable-password accounts can't reset via
            # email — surface a clear, actionable message.
            return Response(
                {
                    "detail": (
                        "This account signs in with a social provider and "
                        "has no password to reset. Please use the original "
                        "sign-in method."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Guard against the most common misconfiguration: SMTP backend
        # selected but no host/user/password configured. Django's SMTP
        # backend will raise an opaque "Invalid address ''" if it can't
        # build a valid envelope, so we short-circuit with an actionable
        # message instead.
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
                            "We couldn't send the reset email due to a "
                            "server configuration problem."
                        ),
                        "debug_error": (
                            f"Email backend '{settings.EMAIL_BACKEND}' "
                            f"failed to open: {exc.__class__.__name__}: {exc}"
                        ),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            # In production stay silent on mail-server details, but
            # still tell the user the send didn't happen.
            return Response(
                {
                    "detail": (
                        "We couldn't send the reset email right now. "
                        "Please try again in a few minutes."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            send_password_reset_email(request, user)
        except Exception as exc:
            if settings.DEBUG:
                return Response(
                    {
                        "detail": (
                            "We couldn't send the reset email due to a "
                            "server problem."
                        ),
                        "debug_error": (
                            f"Send failed via {settings.EMAIL_BACKEND}: "
                            f"{exc.__class__.__name__}: {exc}"
                        ),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(
                {
                    "detail": (
                        "We couldn't send the reset email right now. "
                        "Please try again in a few minutes."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {"detail": "A password reset link has been sent to your email."},
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
