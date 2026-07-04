# Local bKash & Nagad Payment Simulator

A drop-in replacement for the real bKash / Nagad payment servers, built into the
Django project itself. It speaks the same wire protocol as the production
gateways, so the rest of MobileHub never has to know it's talking to a fake.

This is meant for university demos and thesis walkthroughs: it produces the full
"enter number → OTP → PIN → success" UX without moving any real money.

---

## What it does

Mirrors the bKash Tokenized Checkout (`v1.2.0-beta`) and Nagad Remote Payment
Gateway endpoints that the real providers expose, and renders a customer-facing
"hosted" page that looks like a sandbox payment page.

| Real endpoint (bKash)                                  | Simulator route                                                       |
|--------------------------------------------------------|----------------------------------------------------------------------|
| `POST /tokenized/checkout/token/grant`                 | `POST /sim/bkash/tokenized/checkout/token/grant`                    |
| `POST /tokenized/checkout/payment/create`              | `POST /sim/bkash/tokenized/checkout/payment/create`                 |
| `POST /tokenized/checkout/payment/execute/<paymentID>` | `POST /sim/bkash/tokenized/checkout/payment/execute/<id>`           |
| hosted page (bka.sh)                                   | `GET  /sim/bkash/hosted/<id>/`                                       |
| n/a — internal                                         | `POST /sim/bkash/hosted/<id>/submit/`                                |
| n/a — internal                                         | `POST /sim/bkash/hosted/<id>/cancel/`                                |

| Real endpoint (Nagad)                                                  | Simulator route                                                  |
|------------------------------------------------------------------------|-------------------------------------------------------------------|
| `POST /remote-payment-gateway-1.0/check-out/initialize/<merchant>/<order>` | `POST /sim/nagad/remote-payment-gateway-1.0/check-out/initialize/...` |
| `POST /remote-payment-gateway-1.0/check-out/complete/<ref>`           | `POST /sim/nagad/remote-payment-gateway-1.0/check-out/complete/<ref>` |
| `POST /remote-payment-gateway-1.0/check-out/verify/<ref>`             | `POST /sim/nagad/remote-payment-gateway-1.0/check-out/verify/<ref>`   |
| hosted page                                                            | `GET  /sim/nagad/hosted/<ref>/`                                   |
| n/a — internal                                                         | `POST /sim/nagad/hosted/<ref>/submit/`                            |
| n/a — internal                                                         | `POST /sim/nagad/hosted/<ref>/cancel/`                            |

---

## Running it locally

You need two Django processes: one for MobileHub itself (port 8000) and one
for the simulator (port 8001). The MobileHub `bkash.py` / `nagad.py` providers
already read `BKASH_BASE_URL` / `NAGAD_BASE_URL` from the environment, so you
just point them at the simulator.

```bash
# Terminal 1 — MobileHub backend
cd backend
.venv/bin/python manage.py runserver 8000

# Terminal 2 — Simulator (same project, same venv, different port).
# The simulator doesn't need BKASH_BASE_URL or NAGAD_BASE_URL — it IS the
# gateway. Both servers can also be started with the env vars baked into
# backend/.env so the provider always points at the simulator.
cd backend
.venv/bin/python manage.py runserver 8001

# Terminal 3 — Frontend
cd frontend
npm run dev
```

Open `http://localhost:5173`, add something to the cart, choose **bKash** or
**Nagad** at checkout, and you'll be sent to a hosted page on port 8001.

---

## Test credentials

### bKash (three steps)

| Step      | Input               | Result                          |
|-----------|---------------------|---------------------------------|
| 1 number  | any 11 digits       | advances to OTP step            |
| 2 OTP     | shown on the screen | advances to PIN step            |
| 3 PIN     | `12345`             | **Approved** → order flips to Paid |
| 3 PIN     | `99999`             | **Failed** → order stays unpaid  |
| 3 PIN     | anything else       | rejected with an error message  |

### Nagad (one step)

| Step | Input    | Result                                 |
|------|----------|----------------------------------------|
| PIN  | `12345`  | **Approved** → order flips to Paid     |
| PIN  | `99999`  | **Failed** → order stays unpaid        |
| PIN  | else     | rejected with an error message         |

A successful bKash payment returns `trxID` like `TR715F9AF2`; a successful
Nagad payment returns `trxId` like `NAGAD-75F452B470`.

---

## How state is tracked

The simulator holds everything in memory inside
`apps/payments/simulator/state.py`:

```python
SimPayment(payment_id, provider, order_number, amount,
           stage, number, otp, pin, final_status, ...)
```

Stages:

```
Created → AwaitsNumber → AwaitsOtp → AwaitsPin → Approved | Failed
                (Nagad skips AwaitsOtp — single PIN step)
```

State is **per-process**. If you restart `runserver`, any in-flight payments
are forgotten and the order will sit at "Awaiting gateway confirmation" until
you restart the simulator with a known `paymentID` (the MobileHub polling loop
keeps calling `execute()` and won't block).

For thesis demos this is fine: the payment is short-lived and you place one
order per slide anyway.

---

## File layout

```
backend/apps/payments/simulator/
├── __init__.py
├── apps.py                  # SimulatorConfig (label = payments_simulator)
├── state.py                 # in-memory SimPayment dict + thread-safe helpers
├── urls.py                  # 12 URL patterns under app_name "payments_simulator"
├── views.py                 # bKash + Nagad endpoints, hosted page, result page
└── templates/simulator/
    └── hosted.html          # multi-step number/OTP/PIN form
```

Wired into the project via:

- `config/settings.py` → `INSTALLED_APPS += ["apps.payments.simulator"]`
- `config/urls.py` → `path("sim/", include("apps.payments.simulator.urls"))`

---

## Switching back to the real gateways

Unset (or remove) `BKASH_BASE_URL` and `NAGAD_BASE_URL` from the environment and
the providers fall back to:

- bKash: `https://tokenized.pay.bka.sh/v1.2.0-beta`
- Nagad: `https://api.mynagad.com/remote-payment-gateway-1.0`

You'll also need real `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`,
`BKASH_PASSWORD`, `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_KEY`, etc. The simulator
ignores all of them, so leaving them set is harmless.

---

## Smoke test (already passing)

The full happy path has been verified end-to-end with Django's test client:

```
=== bKash round trip ===
1 token grant: 0000 id_token: SIM-TOKEN-...
2 create: 0000 SIM-BKASH-9747FCAB8C
3 execute (before approval): 0000 tStatus: initiated
4 step1 status: 200 has OTP hint: True
5 OTP extracted: 6977
6 step2 status: 200 has PIN step: True
7 approve success: True
8 execute (after approval): 0000 tStatus: completed trxID: TR715F9AF2

=== bKash FAILED path (wrong PIN) ===
9b decline: True
10 execute (after decline): 9999 msg: Customer declined the payment

=== Nagad round trip ===
N1 init: Success SIM-NAGAD-F46327CF68
N2 hosted page: 200 has Nagad PIN step: True
N3 complete (no-op): Success
N4 approve: True
N5 verify: Success trxId: NAGAD-75F452B470
```