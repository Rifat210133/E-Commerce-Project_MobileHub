import api from "./client";

/**
 * Online payment adapters — bKash and Nagad.
 *
 * Flow (matches the backend ``apps.payments.views`` contract):
 *   1. The checkout endpoint already issues a hosted-page URL and a
 *      ``paymentID`` for online methods — see
 *      ``apps.orders.views.checkout``. The Order is NOT created yet;
 *      the cart + address are snapshotted on the PaymentAttempt and
 *      the Order is materialised inside ``/execute`` only after the
 *      gateway confirms. ``createPayment()`` below is now mostly a
 *      safety net (idempotency for a second click, or a "restart the
 *      gateway tab" button on the checkout screen).
 *   2. Caller opens the URL in a new tab and the user completes
 *      payment with the provider.
 *   3. ``pollUntilPaid(provider, paymentId, opts)`` calls
 *      ``executePayment`` every ~2s (max 60s) until the backend reports
 *      a terminal status. Backend materialises the Order on ``Paid``
 *      and returns the new ``order_number`` so the caller can route to
 *      ``/orders/<number>``.
 *
 * Backend also exposes a GET ``/return/`` URL the provider redirects
 * to when the hosted page closes — that path performs the same flip
 * server-side so this polling is mostly a UX nicety (faster screen
 * update) and a safety net for the "user closed the hosted tab early"
 * case. On return, the backend redirects to ``/orders/<n>`` when an
 * Order exists, or back to ``/checkout`` when nothing was materialised
 * (e.g. user closed the tab before completing).
 */

const SUPPORTED = ["bkash", "nagad"];

/**
 * Create / re-fetch a payment session for an unpaid online order.
 *
 * Idempotent: a second call with the same ``draftId`` returns the
 * same paymentID (the backend reuses an Initiated attempt). If a
 * legacy caller passes ``orderNumber``, the backend locates the
 * existing Order and creates / reuses the attempt against it.
 *
 * @param {"bkash"|"nagad"} provider
 * @param {{draftId?: number, draftNumber?: string, orderNumber?: string}} ref
 * @returns {Promise<{payment_id: string, redirect_url: string, reused: boolean, draft_id?: number}>}
 */
export async function createPayment(provider, ref) {
  if (!SUPPORTED.includes(provider)) {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }
  const body = {};
  if (ref?.draftId) body.draft_id = ref.draftId;
  if (ref?.draftNumber) body.draft_number = ref.draftNumber;
  if (ref?.orderNumber) body.order_number = ref.orderNumber;
  if (Object.keys(body).length === 0) {
    throw new Error(
      "createPayment requires draftId (new flow) or orderNumber (legacy)."
    );
  }
  const { data } = await api.post(`/payments/${provider}/create/`, body);
  return data;
}

/**
 * Ask the backend to verify a payment with the gateway. Backend will
 * internally materialise the Order (new flow) or stamp paid_at/paid_via
 * (legacy) when the gateway reports ``Paid``.
 *
 * @param {"bkash"|"nagad"} provider
 * @param {string} paymentId
 * @returns {Promise<{payment_id: string, status: "Paid"|"Initiated"|"Executed"|"Failed"|"Cancelled", order: string|null}>}
 */
export async function executePayment(provider, paymentId) {
  if (!SUPPORTED.includes(provider)) {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }
  const { data } = await api.post(`/payments/${provider}/execute/`, {
    payment_id: paymentId,
  });
  return data;
}

/**
 * Poll the execute endpoint until the payment is terminal.
 *
 * Resolves with the final ``execute`` payload. Rejects only on network
 * failure or if the timeout elapses while the payment is still
 * non-terminal — in that case the user is still on the checkout screen
 * and can retry the payment from there. We don't reject on a "Failed"
 * gateway response because that's a legitimate terminal outcome the
 * caller wants to render.
 *
 * On a Paid response, the returned payload carries the freshly-created
 * ``order_number`` in ``result.order`` — the caller navigates to
 * ``/orders/<number>``. On Failed / Cancelled, ``result.order`` is
 * null; the caller stays on the checkout screen and lets the user
 * retry.
 *
 * @param {"bkash"|"nagad"} provider
 * @param {string} paymentId
 * @param {{intervalMs?: number, timeoutMs?: number, signal?: AbortSignal}} [opts]
 * @returns {Promise<{status: string, payment_id: string, order: string|null}>}
 */
export function pollUntilPaid(provider, paymentId, opts = {}) {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 60000;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (opts.signal?.aborted) {
        reject(new DOMException("Polling aborted", "AbortError"));
        return;
      }
      try {
        const result = await executePayment(provider, paymentId);
        if (["Paid", "Failed", "Cancelled"].includes(result.status)) {
          resolve(result);
          return;
        }
      } catch (err) {
        // Transient network error → keep polling until timeout.
        // eslint-disable-next-line no-console
        console.warn("[payments] execute failed, will retry:", err?.message || err);
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error("Payment confirmation timed out. You can retry from the checkout page."));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
