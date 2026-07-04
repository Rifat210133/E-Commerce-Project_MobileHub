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

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
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
    return render(request, "simulator/hosted.html", context)


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
        return render(request, "simulator/hosted.html", ctx)

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
            return _render_result(request, approved=False, order_number=payment.order_number)
        if pin != "12345":
            return HttpResponse(
                "<h3 style='color:#E2136E'>Wrong PIN. Sandbox accepts 12345 (or 99999 to simulate failure).</h3>",
                status=400,
            )
        payment.stage = "Approved"
        return _render_result(request, approved=True, order_number=payment.order_number)

    return HttpResponse("Unexpected stage", status=400)


@csrf_exempt
@require_http_methods(["POST"])
def bkash_hosted_cancel(request: HttpRequest, payment_id: str) -> HttpResponse:
    payment = state.get(payment_id)
    if payment is not None and payment.stage not in {"Approved", "Failed"}:
        payment.stage = "Failed"
    return HttpResponse(
        "<h3>Payment cancelled.</h3>"
        "<p>You can return to MobileHub and try again.</p>"
    )


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
        "simulator/hosted.html",
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
        return _render_result(request, approved=False, order_number=payment.order_number)
    if pin != "12345":
        return HttpResponse(
            "<h3 style='color:#ED1C24'>Wrong PIN. Sandbox accepts 12345 (or 99999 to simulate failure).</h3>",
            status=400,
        )
    payment.stage = "Approved"
    return _render_result(request, approved=True, order_number=payment.order_number)


@csrf_exempt
@require_http_methods(["POST"])
def nagad_hosted_cancel(request: HttpRequest, payment_id: str) -> HttpResponse:
    payment = state.get(payment_id)
    if payment is not None and payment.stage not in {"Approved", "Failed"}:
        payment.stage = "Failed"
    return HttpResponse("<h3>Payment cancelled.</h3>")


# ==========================================================================
# Shared template helpers
# ==========================================================================
def _render_pin(request: HttpRequest, payment) -> HttpResponse:
    """Render the PIN step. Only used by bKash; Nagad skips this stage."""
    return render(
        request,
        "simulator/hosted.html",
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


def _render_result(request: HttpRequest, *, approved: bool, order_number: str) -> HttpResponse:
    """Final screen the customer sees after approving/declining. Shows a
    link back to the order page so the demo flows naturally."""
    color = "#10B981" if approved else "#E2136E"
    label = "Payment successful" if approved else "Payment failed"
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
  <p>Order <strong>{order_number}</strong></p>
  <button onclick="window.close();">Close this tab</button>
  <a href='/orders/{order_number}'>Or view the order in MobileHub</a>
</div>
<script>
  // Tell the opener to reload its order page so it picks up the fresh
  // paid_at the polling loop just wrote. We use location.reload() (not
  // location.href = ...) because navigating to a new URL doesn't always
  // re-run useEffect on a SPA route — the user would still see Pending.
  if (window.opener) {{
    try {{
      window.opener.location.replace('/orders/{order_number}?_t=' + Date.now());
      setTimeout(function () {{ window.close(); }}, 400);
    }} catch (e) {{}}
  }} else {{
    setTimeout(function () {{ window.location.href = '/orders/{order_number}'; }}, 800);
  }}
</script>
</body></html>
"""
    )
