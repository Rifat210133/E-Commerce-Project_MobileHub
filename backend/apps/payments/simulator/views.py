"""HTTP endpoints that mimic bKash Tokenized Checkout and the Nagad
Remote Payment Gateway.

Endpoints
---------

bKash (mirrors ``https://tokenized.pay.bka.sh/v1.2.0-beta``):

* ``POST /sim/bkash/token/grant``                — returns a fake ``id_token``
* ``POST /sim/bkash/payment/create``             — issues ``paymentID`` + ``bkashURL``
* ``POST /sim/bkash/payment/execute/<paymentID>`` — returns ``statusCode:0000`` once approved
* ``GET  /sim/bkash/hosted/<paymentID>/``         — customer-facing HTML (number → OTP → PIN)

Nagad (mirrors ``https://api.mynagad.com/remote-payment-gateway-1.0``):

* ``POST /sim/nagad/check-out/initialize/...``    — issues ``payment_reference_id`` + ``callBackUrl``
* ``POST /sim/nagad/check-out/complete/<ref>``    — accepts OTP; sandbox ignores it
* ``POST /sim/nagad/check-out/verify/<ref>``      — returns Success once approved
* ``GET  /sim/nagad/hosted/<paymentID>/``          — customer-facing HTML

The hosted pages share a single template — the markup looks like bKash
because that's what most customers will recognize.
"""
from __future__ import annotations

import json
import re
import time
import uuid

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from . import state


# --------------------------------------------------------------------------
# Constants used by execute() responses
# --------------------------------------------------------------------------
_BKASH_SUCCESS = {"0000"}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _bad_request(msg: str, **extra) -> JsonResponse:
    """Return a provider-shaped error response."""
    body = {"statusCode": "9999", "statusMessage": msg, "error": msg}
    body.update(extra)
    return JsonResponse(body, status=400)


def _require_post(request: HttpRequest) -> dict | None:
    """Parse JSON body or return a 400."""
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


# Phone number used for in-memory OTP "send". Sandbox just echoes back.
_OTP_NUM = {}


# ==========================================================================
# bKash endpoints
# ==========================================================================
@csrf_exempt
@require_http_methods(["POST"])
def bkash_token_grant(request: HttpRequest) -> JsonResponse:
    """Always returns a fresh-looking token. Real bKash checks app_key
    signature; we don't because this is a teaching simulator."""
    token = f"SIM-TOKEN-{uuid.uuid4().hex}"
    return JsonResponse(
        {
            "statusCode": "0000",
            "statusMessage": "Success",
            "id_token": token,
            "expires_in": 3600,
            "token_type": "Bearer",
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def bkash_payment_create(request: HttpRequest) -> JsonResponse:
    payload = _require_post(request)
    if payload is None:
        return _bad_request("Invalid JSON")
    order_number = payload.get("merchantInvoiceNumber") or "UNKNOWN"
    amount = payload.get("amount", "0")

    payment = state.create(
        provider="bkash",
        order_number=order_number,
        amount=str(amount),
        raw=payload,
    )
    payment.stage = "AwaitsNumber"
    hosted_url = request.build_absolute_uri(
        reverse("payments_simulator:bkash_hosted", args=[payment.payment_id])
    )
    return JsonResponse(
        {
            "statusCode": "0000",
            "statusMessage": "Success",
            "paymentID": payment.payment_id,
            "bkashURL": hosted_url,
            "callbackURL": payload.get("callbackURL", ""),
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def bkash_payment_execute(request: HttpRequest, payment_id: str) -> JsonResponse:
    """Mirror real bKash execute. If the customer approved via PIN=12345,
    return statusCode 0000; if they entered PIN=99999, return failure;
    otherwise pretend they're still in flight so the FE keeps polling."""
    payment = state.get(payment_id)
    if payment is None:
        return _bad_request("Unknown paymentID", paymentID=payment_id)

    if payment.stage == "Approved":
        return JsonResponse(
            {
                "statusCode": "0000",
                "statusMessage": "Successful",
                "paymentID": payment_id,
                "transactionStatus": "completed",
                "trxID": f"TR{uuid.uuid4().hex[:8].upper()}",
                "amount": payment.amount,
                "currency": "BDT",
                "merchantInvoiceNumber": payment.order_number,
            }
        )
    if payment.stage == "Failed":
        return _bad_request("Customer declined the payment", paymentID=payment_id)
    # Still waiting on customer — return a non-terminal code that the FE
    # polling loop recognises as "try again".
    return JsonResponse(
        {
            "statusCode": "0000",
            "statusMessage": "In Progress",
            "paymentID": payment_id,
            "transactionStatus": "initiated",
        }
    )


# ==========================================================================
# bKash hosted page (customer-facing HTML)
# ==========================================================================
def bkash_hosted(request: HttpRequest, payment_id: str) -> HttpResponse:
    """Renders the simulated bKash PIN entry page. Three-step form:
    bkash number → OTP → PIN → approve."""
    payment = state.get(payment_id)
    if payment is None:
        return HttpResponse("Unknown payment", status=404)

    if payment.stage == "Created":
        payment.stage = "AwaitsNumber"

    context = {
        "payment_id": payment_id,
        "order_number": payment.order_number,
        "amount": payment.amount,
        "provider": "bkash",
        "provider_label": "bKash",
        "stage": payment.stage,
        "submit_url": reverse("payments_simulator:bkash_submit", args=[payment_id]),
        "cancel_url": reverse("payments_simulator:bkash_cancel", args=[payment_id]),
    }
    return render(request, "hosted.html", context)


@csrf_exempt
@require_http_methods(["POST"])
def bkash_hosted_submit(request: HttpRequest, payment_id: str) -> HttpResponse:
    """Handle any of the three steps depending on the current stage."""
    payment = state.get(payment_id)
    if payment is None:
        return HttpResponse("Unknown payment", status=404)
    number = (request.POST.get("number") or "").strip()
    otp = (request.POST.get("otp") or "").strip()
    pin = (request.POST.get("pin") or "").strip()

    if payment.stage == "AwaitsNumber":
        if not re.fullmatch(r"\d{11}", number):
            return HttpResponse(
                "<h3 style='color:#E2136E'>Invalid bKash number — must be 11 digits.</h3>",
                status=400,
            )
        payment.number = number
        payment.otp = str(int(time.time()) % 10000).zfill(4)  # ephemeral OTP
        _OTP_NUM[payment_id] = payment.otp
        payment.stage = "AwaitsOtp"
        # Re-render with a hint of the OTP for the demo. Real bKash would
        # send via SMS; for the simulator we show it on screen.
        ctx = {
            "payment_id": payment_id,
            "order_number": payment.order_number,
            "amount": payment.amount,
            "provider": "bkash",
            "provider_label": "bKash",
            "stage": payment.stage,
            "demo_otp": payment.otp,
            "submit_url": reverse("payments_simulator:bkash_submit", args=[payment_id]),
            "cancel_url": reverse("payments_simulator:bkash_cancel", args=[payment_id]),
        }
        return render(request, "hosted.html", ctx)

    if payment.stage == "AwaitsOtp":
        if otp != payment.otp:
            return HttpResponse(
                "<h3 style='color:#E2136E'>Wrong OTP. The simulated OTP was shown on the previous screen.</h3>",
                status=400,
            )
        payment.stage = "AwaitsPin"
        return _render_pin(request, payment)

    if payment.stage == "AwaitsPin":
        if pin == "99999":
            payment.stage = "Failed"
            return _render_result(request, approved=False, order_number=payment.order_number, payment_id=payment.payment_id, provider=payment.provider)
        if pin != "12345":
            return HttpResponse(
                "<h3 style='color:#E2136E'>Wrong PIN. Sandbox accepts 12345 (or 99999 to simulate failure).</h3>",
                status=400,
            )
        payment.stage = "Approved"
        return _render_result(request, approved=True, order_number=payment.order_number, payment_id=payment.payment_id, provider=payment.provider)

    return HttpResponse("Unexpected stage", status=400)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def bkash_hosted_cancel(request: HttpRequest, payment_id: str) -> HttpResponse:
    payment = state.get(payment_id)
    if payment is not None and payment.stage not in {"Approved", "Failed"}:
        payment.stage = "Failed"
    # Mark the matching DB PaymentAttempt as Cancelled so the FE can
    # poll-and-stop (no point polling an attempt the user has given up
    # on) and so the admin can audit it later.
    _cancel_db_attempt(payment_id)
    # The customer clicks "Cancel" on a button that fires a plain GET,
    # so we accept both verbs and always bounce them back to /checkout.
    # The legacy flow redirected to /orders/<order_number>, but with the
    # deferred-Order flow no Order exists yet on cancel — sending the
    # user to /orders/UNKNOWN would just 404. /checkout keeps the cart
    # visible and lets them retry the payment.
    return _redirect_to_checkout()


# ==========================================================================
# Nagad endpoints


# ==========================================================================
# Nagad endpoints
# ==========================================================================
@csrf_exempt
@require_http_methods(["POST"])
def nagad_initialize(request: HttpRequest, merchant_id: str, order_id: str) -> JsonResponse:
    """Mirror Nagad /check-out/initialize/<merchant>/<order>. Always
    succeeds and hands back a hosted URL pointing at this server.
    The ``merchant_id`` is informational only — real Nagad uses it for
    routing across multiple merchants; the simulator is single-tenant."""
    payload = _require_post(request)
    if payload is None:
        return _bad_request("Invalid JSON")
    order_number = payload.get("orderId") or "UNKNOWN"
    amount = payload.get("amount", "0")

    payment = state.create(
        provider="nagad",
        order_number=order_number,
        amount=str(amount),
        raw=payload,
    )
    payment.stage = "AwaitsNumber"
    hosted_url = request.build_absolute_uri(
        reverse("payments_simulator:nagad_hosted", args=[payment.payment_id])
    )
    return JsonResponse(
        {
            "paymentReferenceId": payment.payment_id,
            "challenge": "",
            "callBackUrl": hosted_url,
            "status": "Success",
            "issuerPaymentRefNo": f"NAGAD{uuid.uuid4().hex[:6].upper()}",
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def nagad_complete(request: HttpRequest, payment_ref: str) -> JsonResponse:
    """Nagad's complete step is a no-op for the simulator; we accept any
    challenge."""
    payment = state.get(payment_ref)
    if payment is None:
        return _bad_request("Unknown paymentReferenceId")
    return JsonResponse({"status": "Success", "paymentReferenceId": payment_ref})


@csrf_exempt
@require_http_methods(["POST"])
def nagad_verify(request: HttpRequest, payment_ref: str) -> JsonResponse:
    """Final status — same shape as bKash execute."""
    payment = state.get(payment_ref)
    if payment is None:
        return _bad_request("Unknown paymentReferenceId")
    if payment.stage == "Approved":
        return JsonResponse(
            {
                "status": "Success",
                "paymentReferenceId": payment_ref,
                "orderId": payment.order_number,
                "amount": payment.amount,
                "trxId": f"NAGAD-{uuid.uuid4().hex[:10].upper()}",
            }
        )
    if payment.stage == "Failed":
        return JsonResponse(
            {
                "status": "Failed",
                "paymentReferenceId": payment_ref,
                "orderId": payment.order_number,
            }
        )
    return JsonResponse(
        {
            "status": "Initiated",
            "paymentReferenceId": payment_ref,
            "orderId": payment.order_number,
        }
    )


def nagad_hosted(request: HttpRequest, payment_id: str) -> HttpResponse:
    payment = state.get(payment_id)
    if payment is None:
        return HttpResponse("Unknown payment", status=404)
    if payment.stage == "Created":
        payment.stage = "AwaitsNumber"
    return render(
        request,
        "hosted.html",
        {
            "payment_id": payment_id,
            "order_number": payment.order_number,
            "amount": payment.amount,
            "provider": "nagad",
            "provider_label": "Nagad",
            "stage": payment.stage,
            "submit_url": reverse("payments_simulator:nagad_submit", args=[payment_id]),
            "cancel_url": reverse("payments_simulator:nagad_cancel", args=[payment_id]),
        },
    )


@csrf_exempt
@require_http_methods(["POST"])
def nagad_hosted_submit(request: HttpRequest, payment_id: str) -> HttpResponse:
    payment = state.get(payment_id)
    if payment is None:
        return HttpResponse("Unknown payment", status=404)
    pin = (request.POST.get("pin") or "").strip()
    # Nagad's hosted page collapses number + OTP + PIN into one PIN step in
    # the simulator — saves three clicks per demo.
    if pin == "99999":
        payment.stage = "Failed"
        return _render_result(request, approved=False, order_number=payment.order_number, payment_id=payment.payment_id, provider=payment.provider)
    if pin != "12345":
        return HttpResponse(
            "<h3 style='color:#ED1C24'>Wrong PIN. Sandbox accepts 12345 (or 99999 to simulate failure).</h3>",
            status=400,
        )
    payment.stage = "Approved"
    return _render_result(request, approved=True, order_number=payment.order_number, payment_id=payment.payment_id, provider=payment.provider)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def nagad_hosted_cancel(request: HttpRequest, payment_id: str) -> HttpResponse:
    payment = state.get(payment_id)
    if payment is not None and payment.stage not in {"Approved", "Failed"}:
        payment.stage = "Failed"
    # See bkash_hosted_cancel — we redirect to /checkout so the cart is
    # still there and the customer can retry the payment instead of
    # bouncing off a /orders/UNKNOWN 404.
    _cancel_db_attempt(payment_id)
    return _redirect_to_checkout()


# ==========================================================================
# Shared template helpers
# ==========================================================================
def _render_pin(request: HttpRequest, payment) -> HttpResponse:
    """Render the PIN step. Only used by bKash; Nagad skips this stage."""
    return render(
        request,
        "hosted.html",
        {
            "payment_id": payment.payment_id,
            "order_number": payment.order_number,
            "amount": payment.amount,
            "provider": payment.provider,
            "provider_label": "bKash",
            "stage": "AwaitsPin",
            "submit_url": reverse("payments_simulator:bkash_submit", args=[payment.payment_id]),
            "cancel_url": reverse("payments_simulator:bkash_cancel", args=[payment.payment_id]),
        },
    )


def _redirect_to_order(order_number: str) -> HttpResponse:
    """Legacy helper — kept for any code path that still wants to bounce
    to ``/orders/<order_number>``. New code should prefer
    :func:`_redirect_to_checkout` since the deferred-Order flow means no
    Order exists at cancel time.
    """
    frontend_base = (
        settings.FRONTEND_BASE_URL
        or settings.HUB_BASE_URL
        or "http://127.0.0.1:5173"
    ).rstrip("/")
    return HttpResponseRedirect(f"{frontend_base}/orders/{order_number}")


def _redirect_to_checkout() -> HttpResponse:
    """Bounce the customer back to the React checkout page.

    Used by the simulator's cancel buttons. In the deferred-Order flow,
    no Order exists at cancel time, so the legacy ``/orders/<number>``
    redirect would 404 — sending the user to ``/checkout`` instead keeps
    the cart visible so they can retry the payment without re-entering
    their address.
    """
    frontend_base = (
        settings.FRONTEND_BASE_URL
        or settings.HUB_BASE_URL
        or "http://127.0.0.1:5173"
    ).rstrip("/")
    return HttpResponseRedirect(f"{frontend_base}/checkout")


def _cancel_db_attempt(payment_id: str) -> None:
    """Mark the matching DB ``PaymentAttempt`` as ``Cancelled``.

    The simulator's in-memory ``state.SimPayment`` is one thing; the DB
    PaymentAttempt is the source of truth the FE polls. Without this,
    the poller would keep pinging ``/execute`` for a session the user
    has already walked away from — wasteful, and the FE would block on
    the spinner until manual refresh.

    Errors are swallowed: cancel is a best-effort UX nicety; we never
    want it to throw because the SPA is already navigating away.
    """
    try:
        from apps.payments.models import PaymentAttempt as _PA

        _PA.objects.filter(payment_id=payment_id).exclude(
            status__in={"Paid", "Cancelled"}
        ).update(status="Cancelled")
    except Exception:
        # Model might not import cleanly during isolated tests; never
        # break the redirect because of an audit-log write.
        pass


def _resolve_real_order_number(payment_id: str, provider: str, fallback: str) -> str:
    """Return the *real* ``MH-#####`` order_number once the gateway approves.

    In the deferred-Order flow, ``payment_id`` is associated with a
    ``PaymentAttempt`` whose ``order_number`` argument we passed in was
    actually the ``draft_number`` (``MH-D12345``) — it isn't a real
    Order yet. The Order is materialised by ``payment_execute`` only
    AFTER the gateway confirms.

    So before we bounce the opener back to ``/orders/<n>``, we must:
      1. Run the same execute path the FE poller would, so any
         transient ``Initiated`` state is forced to ``Paid`` and the
         Order row is created.
      2. Read the freshly-created Order's ``order_number`` off the
         attempt (``attempt.order.order_number``).

    On any failure — provider down, attempt missing, materialisation
    refused — we keep the caller's ``fallback`` so the customer still
    sees *some* sensible link instead of ``/orders/MH-D12345``.
    """
    fallback = (fallback or "").strip()
    try:
        from apps.payments.models import PaymentAttempt as _PA

        attempt = _PA.objects.filter(
            payment_id=payment_id, provider=provider
        ).first()
        if attempt is None:
            return fallback
        # Force the execute path so Paid state + Order materialisation
        # happen in this request, not asynchronously.
        if not attempt.is_terminal:
            from apps.payments.views import payment_execute as _exec

            # payment_execute is a DRF view; we can't call it directly
            # because it expects a real DRF Request and IsAuthenticated.
            # Re-implement the materialisation here instead — the core
            # is _materialize_order_from_attempt, which is idempotent and
            # already wraps itself in SELECT FOR UPDATE.
            try:
                from apps.payments import views as _pviews

                prov_cls = _pviews._PROVIDERS.get(provider)
                if prov_cls is not None:
                    result = prov_cls().execute(payment_id=payment_id)
                    attempt.raw_response = result.raw
                    if result.status == "Paid" and attempt.status != "Paid":
                        attempt.status = "Paid"
                        if attempt.has_order:
                            order = attempt.order
                            if order.paid_at is None:
                                order.paid_at = timezone.now()
                                order.paid_via = provider
                                order.status = "Confirmed"
                                order.status_notes = (
                                    f"Payment received via {provider.title()}."
                                )
                                order.save(
                                    update_fields=[
                                        "paid_at",
                                        "paid_via",
                                        "status",
                                        "status_notes",
                                    ]
                                )
                        else:
                            _pviews._materialize_order_from_attempt(attempt)
                        attempt.save(
                            update_fields=["status", "raw_response", "updated_at"]
                        )
            except Exception:
                # Best-effort. If execute fails here, the FE poller will
                # retry and the Order will materialise shortly after.
                pass
        if attempt.has_order:
            return attempt.order.order_number
    except Exception:
        pass
    return fallback


def _render_result(request: HttpRequest, *, approved: bool, order_number: str, payment_id: str | None = None, provider: str | None = None) -> HttpResponse:
    """Final screen the customer sees after approving/declining. Shows a
    link back to the order page so the demo flows naturally."""
    color = "#10B981" if approved else "#E2136E"
    label = "Payment successful" if approved else "Payment failed"
    # The simulator runs on its own port (default :8001); relative paths
    # like "/orders/<n>" would resolve against the simulator's origin and
    # hit Django's 404 (the hub has no SPA fallback during dev). Always
    # send the customer back to the React app's absolute URL — the Vite
    # dev origin in development, the same as HUB_BASE_URL in production
    # once Django serves the built bundle.
    frontend_base = (
        settings.FRONTEND_BASE_URL
        or settings.HUB_BASE_URL
        or "http://127.0.0.1:5173"
    ).rstrip("/")

    # In the deferred-Order flow, ``order_number`` is the *draft*
    # number (e.g. ``MH-D12345``) — not a real Order yet. The Order
    # only exists after payment_execute materialises it. Resolve to
    # the real MH-##### so the opener lands on a page that 200s
    # instead of bouncing off /orders/MH-D12345 → 404 → infinite
    # spinner on OrderDetailPage.
    real_order = ""
    if approved and payment_id and provider:
        real_order = _resolve_real_order_number(payment_id, provider, "")
    # On failure, we deliberately do NOT redirect to /orders/<draft>
    # — that 404s. Fall through to /orders (list) so the user at
    # least lands on a real page.
    target_path = (
        f"/orders/{real_order}" if real_order else "/orders"
    )
    order_url = f"{frontend_base}{target_path}"
    # ``order_number`` (the raw draft/MH-D value) is shown on the
    # success card so the user knows which attempt succeeded — but
    # we don't navigate to it.
    display_number = real_order or order_number or ""
    return HttpResponse(
        f"""<!doctype html>
<html><head><meta charset='utf-8'><title>{label}</title>
<style>
  body {{ font-family: system-ui, sans-serif; text-align: center; padding: 60px; background: #f7f7fa; }}
  .card {{ background: white; border-radius: 12px; padding: 40px; max-width: 420px; margin: auto;
          box-shadow: 0 8px 24px rgba(0,0,0,0.06); }}
  .icon {{ font-size: 64px; color: {color}; }}
  button {{ background: #E2136E; color: white; border: 0; padding: 12px 32px; border-radius: 8px;
            font-size: 16px; cursor: pointer; margin-top: 20px; }}
  a {{ color: #555; display: block; margin-top: 16px; }}
</style></head><body>
<div class='card'>
  <div class='icon'>{'✓' if approved else '✕'}</div>
  <h2 style='color:{color}'>{label}</h2>
  <p>Order <strong>{display_number}</strong></p>
  <button onclick="window.close();">Close this tab</button>
  <a href='{order_url}'>Or view the order in MobileHub</a>
</div>
<script>
  // Send the opener to the freshly-materialised order page. We use
  // ``location.replace`` (not ``location.href = ...``) because that
  // gives us a single history entry instead of polluting back-button
  // history with the gateway return URL. The cache-buster (?_t=...)
  // defeats the SPA's bfcache in case the user lands on the same route
  // twice in a row. ``orderUrl`` points at /orders/<real MH-#####> on
  // success or /orders (list) on failure — never at /orders/MH-Dxxxxx,
  // which would 404 and trap OrderDetailPage on its spinner.
  var orderUrl = '{order_url}';
  if (window.opener) {{
    try {{
      window.opener.location.replace(orderUrl + '?_t=' + Date.now());
      setTimeout(function () {{ window.close(); }}, 400);
    }} catch (e) {{}}
  }} else {{
    setTimeout(function () {{ window.location.href = orderUrl; }}, 800);
  }}
</script>
</body></html>
"""
    )
