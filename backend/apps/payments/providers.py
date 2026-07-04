"""Shared types and the abstract provider interface.

``PaymentProvider.create`` returns a ``CreateResult`` the API view hands
straight to the FE. ``PaymentProvider.execute`` is called both from the
FE's polling loop and from the redirect-handler view — the result is
``ExecuteResult`` plus the provider's last-known status string so the
order can be marked ``paid_at`` exactly once.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CreateResult:
    """What the FE needs to render the redirect/polling flow."""

    payment_id: str
    redirect_url: str  # bKash bkashURL / Nagad challenge URL — empty if none
    raw: dict[str, Any]


@dataclass
class ExecuteResult:
    """What the FE polling loop needs to know whether the payment landed."""

    status: str  # "Paid" / "Failed" / "Initiated" — mirrors PaymentAttempt
    raw: dict[str, Any]


class PaymentProvider:
    """Subclasses implement the create/execute calls.

    They must be safe to instantiate from request context — no shared
    mutable state, no module-level token caches. bKash tokens are
    cached per-instance for the lifetime of one request only.
    """

    code: str = ""  # ``bkash`` / ``nagad`` — matches PaymentAttempt.PROVIDER_CHOICES

    def create(self, *, order, amount: str) -> CreateResult:  # pragma: no cover - interface
        raise NotImplementedError

    def execute(self, *, payment_id: str) -> ExecuteResult:  # pragma: no cover - interface
        raise NotImplementedError