"""In-memory state for the bKash / Nagad simulator.

Each payment attempt lives in a plain dict keyed by ``paymentID``.
We track three stages so the hosted page can render the right
screen (number → OTP → PIN) and so the ``execute`` endpoint can
tell the truth about whether the customer actually confirmed.

Stage transitions:

    Created     → AwaitsNumber  (customer opened the hosted page)
    AwaitsNumber → AwaitsOtp    (customer submitted bkash number)
    AwaitsOtp   → AwaitsPin     (customer submitted OTP)
    AwaitsPin   → Approved | Failed  (customer submitted PIN; 12345 approves, 99999 fails)

Anything else (``Initiated`` in a fresh PaymentAttempt) leaves the
state at "Created" until the FE opens the hosted page or ``execute``
is called.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SimPayment:
    """One in-progress simulated payment."""

    payment_id: str
    provider: str  # "bkash" or "nagad"
    order_number: str
    amount: str
    currency: str = "BDT"
    stage: str = "Created"
    number: str = ""
    otp: str = ""
    pin: str = ""
    final_status: str = ""  # "Paid" / "Failed" — set once execute runs after approval
    created_at: float = field(default_factory=time.time)
    raw_request: dict[str, Any] = field(default_factory=dict)


_lock = threading.Lock()
_payments: dict[str, SimPayment] = {}


def create(*, provider: str, order_number: str, amount: str, raw: dict[str, Any]) -> SimPayment:
    """Register a fresh payment and return it."""
    with _lock:
        pid = f"SIM-{provider.upper()}-{uuid.uuid4().hex[:10].upper()}"
        p = SimPayment(
            payment_id=pid,
            provider=provider,
            order_number=order_number,
            amount=amount,
            raw_request=raw,
        )
        _payments[pid] = p
        return p


def get(payment_id: str) -> SimPayment | None:
    with _lock:
        return _payments.get(payment_id)


def list_all() -> list[SimPayment]:
    """Used by the admin/debug page."""
    with _lock:
        return list(_payments.values())


def reset() -> None:
    """Clear every payment. Useful in tests."""
    with _lock:
        _payments.clear()
