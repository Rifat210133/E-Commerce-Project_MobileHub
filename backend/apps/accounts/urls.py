from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    BangladeshGeoView,
    CheckEmailView,
    CheckIdentifierView,
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterOTPRequestView,
    RegisterView,
)

app_name = "accounts"

urlpatterns = [
    # Public reference data for the Division → District → Upazila cascading
    # dropdowns used in the profile form (and any future address forms).
    path("bd-geo/", BangladeshGeoView.as_view(), name="bd-geo"),
    # Pre-OTP probe used by the registration page to give a friendly
    # "email already registered" message instead of waiting for the user
    # to type a 6-digit code and only then learning the email is taken.
    path("check-email/", CheckEmailView.as_view(), name="check-email"),
    # Pre-flight probe used by the login page to distinguish "no such
    # account" from "wrong password" — lets the form surface a friendly
    # "no account with that email — want to register?" inline message
    # instead of a misleading generic 401.
    path("check-identifier/", CheckIdentifierView.as_view(), name="check-identifier"),
    # Step 1 of registration: send the 6-digit OTP to the user's email.
    path("register/otp/", RegisterOTPRequestView.as_view(), name="register-otp"),
    # Step 2 of registration: verify the OTP + create the account.
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
    path(
        "password/reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset",
    ),
    path(
        "password/reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
]