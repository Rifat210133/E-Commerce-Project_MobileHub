"""bKash tokenized checkout sandbox adapter.

The official bKash tokenized API has three endpoints we care about:

* ``POST {base}/tokenized/checkout/token/grant``        — get an id_token
* ``POST {base}/tokenized/checkout/payment/create``     — create a payment
* ``POST {base}/tokenized/checkout/payment/execute/{id}`` — capture / verify

In sandbox the credentials below (and the base URL) are public; in live
they must come from a registered merchant account via the env vars in
``config.settings``. All three URLs are overridable so we can point at
a local mock server in unit tests.

We cache the id_token for the lifetime of one provider instance — i.e.
one HTTP request. A Django process is fine to share that across
requests, but the small win isn't worth the staleness risk on token
rotation, so the cache lives on ``self``.
"""
from __future__ import annotations

import threading
import time
from typing import Any

from django.conf import settings

from .http import ProviderHTTPError, post_json
from .providers import CreateResult, ExecuteResult, PaymentProvider


# bKash returns these on execute. We collapse all of them into Paid unless
# the response says the user cancelled or the call timed out.
_BKASH_SUCCESS = {"0000"}


class BkashSandboxProvider(PaymentProvider):
    code = "bkash"

    # Tokens are valid for ~1h. Cache across requests inside a process.
    _token_cache: dict[str, tuple[str, float]] = {}
    _token_lock = threading.Lock()

    def __init__(self) -> None:
        cfg = settings.BKASH
        self.base_url = cfg["BASE_URL"].rstrip("/")
        self.username = cfg["USERNAME"]
        self.password = cfg["PASSWORD"]
        self.app_key = cfg["APP_KEY"]
        self.app_secret = cfg["APP_SECRET"]

    # --- token grant ----------------------------------------------------------
    def _id_token(self) -> str:
        """Return a fresh-ish bKash ID token, refreshing if expired."""
        with self._token_lock:
            cached = self._token_cache.get(self.app_key)
            if cached and cached[1] > time.time() + 30:  # 30s safety margin
                return cached[0]
            data = post_json(
                f"{self.base_url}/tokenized/checkout/token/grant",
                {
                    "app_key": self.app_key,
                    "app_secret": self.app_secret,
                },
                headers={"username": self.username, "password": self.password},
            )
            token = data.get("id_token", "")
            expires_in = int(data.get("expires_in", 3600))
            if not token:
                raise ProviderHTTPError(200, data)
            self._token_cache[self.app_key] = (token, time.time() + expires_in)
            return token

    # --- create ---------------------------------------------------------------
    def create(self, *, order, amount: str) -> CreateResult:
        token = self._id_token()
        # bKash expects the merchant invoice number. We re-use the order
        # number — it's unique and already known to the user, so a mismatch
        # on the bKash receipt is immediately obvious.
        payload: dict[str, Any] = {
            "mode": "0011",
            "payerReference": order.user.username,
            "callbackURL": f"{settings.PUBLIC_BASE_URL}/api/payments/bkash/return/?order={order.order_number}",
            "amount": str(amount),
            "currency": "BDT",
            "intent": "sale",
            "merchantInvoiceNumber": order.order_number,
        }
        try:
            data = post_json(
                f"{self.base_url}/tokenized/checkout/payment/create",
                payload,
                headers={"authorization": token, "x-app-key": self.app_key},
            )
        except ProviderHTTPError as exc:
            # bKash returns ``{"statusCode":"2051","statusMessage":"..."}`` on
            # duplicate invoices. Bubble up the message verbatim — the FE
            # shows it in the toast.
            raise ProviderHTTPError(exc.status, exc.body) from exc
        payment_id = data.get("paymentID", "")
        if not payment_id:
            raise ProviderHTTPError(200, data)
        return CreateResult(
            payment_id=payment_id,
            redirect_url=data.get("bkashURL", ""),
            raw=data,
        )

    # --- execute --------------------------------------------------------------
    def execute(self, *, payment_id: str) -> ExecuteResult:
        token = self._id_token()
        data = post_json(
            f"{self.base_url}/tokenized/checkout/payment/execute/{payment_id}",
            {},
            headers={"authorization": token, "x-app-key": self.app_key},
        )
        status_code = str(data.get("statusCode", ""))
        provider_status = (data.get("transactionStatus") or "").lower()
        if status_code in _BKASH_SUCCESS and provider_status == "completed":
            mapped = "Paid"
        elif provider_status in {"cancelled", "failed"} or status_code not in _BKASH_SUCCESS:
            mapped = "Failed"
        else:
            mapped = "Initiated"  # still pending, poller will retry
        return ExecuteResult(status=mapped, raw=data)