"""Tiny HTTP helper used by the bKash / Nagad clients.

We deliberately avoid pulling in ``requests`` — Django ships with
``urllib.request`` and the providers only need POST + JSON. Anything
fancier (retries, signing, etc.) can layer on top without dragging the
whole ``requests`` dependency tree into the runtime.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

DEFAULT_TIMEOUT = 15  # seconds — sandbox endpoints should respond fast


class ProviderHTTPError(Exception):
    """Raised when the upstream returns a non-2xx or unparseable body."""

    def __init__(self, status: int, body: str | bytes | dict[str, Any]) -> None:
        self.status = status
        self.body = body
        super().__init__(f"HTTP {status}: {body!r}")


def post_json(
    url: str,
    payload: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """POST ``payload`` as JSON and return the parsed body.

    Returns ``{}`` on a 204 No Content so callers don't have to special-case.
    """
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - URL is config-driven
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        # Provider returned a 4xx/5xx — surface the body verbatim so the
        # frontend polling loop can decide whether to retry or fail.
        raw = exc.read() if hasattr(exc, "read") else b""
        try:
            decoded: Any = json.loads(raw or b"null")
        except (json.JSONDecodeError, TypeError):
            decoded = raw.decode("utf-8", errors="replace")
        raise ProviderHTTPError(exc.code, decoded) from exc

    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProviderHTTPError(200, raw) from exc