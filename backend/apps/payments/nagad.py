"""Nagad Payment Gateway (PGW) sandbox adapter.

Nagad's flow is four steps (vs bKash's three):

1. ``POST {base}/remote-payment-gateway-1.0/check-out/initialize/{merchant_id}/{order_id}``
   — returns ``challenge`` + ``payment_reference_id`` + ``callBackUrl``.
2. The FE POSTs the ``challenge`` to
   ``/remote-payment-gateway-1.0/check-out/complete/{payment_ref}``
   along with the OTP (sandbox ignores OTP).
3. ``POST {base}/remote-payment-gateway-1.0/check-out/verify/{payment_ref}``
   — final status check.
4. The FE was redirected to ``callBackUrl`` with the payment ref; we call
   verify ourselves server-side and ignore whatever the FE shows on its
   side (the FE is untrusted).

Note on path segments: the real Nagad gateway mounts everything under
``/remote-payment-gateway-1.0/`` (the same way bKash mounts under
``/tokenized/checkout/``). The provider appends that segment itself so
``settings.NAGAD['BASE_URL']`` stays clean — matches the bKash adapter
and matches what the docs call the "API base URL".

For the sandbox, the merchant credentials and ``merchantPrivateKey``
are pre-published by Nagad; in production they must come from env vars.
"""
from __future__ import annotations

from typing import Any

from django.conf import settings

from .http import ProviderHTTPError, post_json
from .providers import CreateResult, ExecuteResult, PaymentProvider


_NAGAD_SUCCESS = {"Success", "success"}


class NagadSandboxProvider(PaymentProvider):
    code = "nagad"

    def __init__(self) -> None:
        cfg = settings.NAGAD
        self.base_url = cfg["BASE_URL"].rstrip("/")
        self.merchant_id = cfg["MERCHANT_ID"]
        self.merchant_key = cfg["MERCHANT_KEY"]
        # The signing / verification dance would normally use the private
        # key, but in sandbox the gateway accepts plain JSON. We keep
        # these on the instance so production code can wire up signing
        # without changing call-sites.
        self.merchant_private_key = cfg.get("MERCHANT_PRIVATE_KEY", "")
        self.merchant_public_key = cfg.get("MERCHANT_PUBLIC_KEY", "")

    # --- create ---------------------------------------------------------------
    def create(self, *, order, amount: str) -> CreateResult:
        url = (
            f"{self.base_url}/remote-payment-gateway-1.0/check-out/initialize/"
            f"{self.merchant_id}/{order.order_number}"
        )
        # Nagad expects a flat form-encoded body in many implementations
        # but the JSON variant is supported by the sandbox. If production
        # needs form-encoding we can branch on ``settings.NAGAD_FORMAT``.
        payload: dict[str, Any] = {
            "orderId": order.order_number,
            "amount": str(amount),
            "currencyCode": "050",  # BDT
            "challenge": "",
        }
        try:
            data = post_json(
                url,
                payload,
                headers={
                    "merchantId": self.merchant_id,
                    "merchantKey": self.merchant_key,
                },
            )
        except ProviderHTTPError as exc:
            raise ProviderHTTPError(exc.status, exc.body) from exc

        payment_ref = data.get("paymentReferenceId") or data.get("payment_reference_id") or ""
        callback = data.get("callBackUrl") or data.get("callbackUrl") or ""
        if not payment_ref:
            raise ProviderHTTPError(200, data)
        return CreateResult(
            # We use ``payment_ref`` as the FE's polling key so the
            # PaymentAttempt.payment_id is a valid Nagad reference.
            payment_id=payment_ref,
            redirect_url=callback,
            raw=data,
        )

    # --- execute --------------------------------------------------------------
    def execute(self, *, payment_id: str) -> ExecuteResult:
        # In sandbox, complete is a no-op since the gateway auto-completes
        # the challenge. We jump straight to verify.
        verify = post_json(
            f"{self.base_url}/remote-payment-gateway-1.0/check-out/verify/{payment_id}",
            {},
            headers={
                "merchantId": self.merchant_id,
                "merchantKey": self.merchant_key,
            },
        )
        status = verify.get("status") or verify.get("Status") or ""
        if status in _NAGAD_SUCCESS:
            mapped = "Paid"
        elif status.lower() in {"failed", "cancelled", "aborted"}:
            mapped = "Failed"
        else:
            mapped = "Initiated"
        return ExecuteResult(status=mapped, raw=verify)