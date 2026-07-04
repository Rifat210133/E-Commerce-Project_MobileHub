import api from "./client";

/**
 * Online payment adapters — bKash and Nagad.
 *
 * Flow (matches the backend ``apps.payments.views`` contract):
 *   1. ``createPayment(provider, orderNumber)`` → backend issues a
 *      ``paymentID`` with the gateway and returns a hosted-page URL.
 *   2. Caller opens that URL in a new tab and the user completes
 *      payment with the provider.
 *   3. ``pollUntilPaid(provider, paymentId, opts)`` calls
 *      ``executePayment`` every ~2s (max 60s) until the backend reports
 *      the gateway has confirmed the payment. Backend flips
 *      ``Order.paid_at`` + ``paid_via`` when it sees ``Paid``.
 *
 * Backend also exposes a GET ``/return/`` URL the provider redirects
 * to when the hosted page closes — that path performs the same flip
 * server-side so this polling is mostly a UX nicety (faster screen
 * update) and a safety net for the "user closed the hosted tab early"
 * case.
 */

const SUPPORTED = ["bkash", "nagad"];

/**
 * Create a payment session for an unpaid order.
 *
 * Idempotent: a second call with the same orderNumber returns the same
 * paymentID (the backend reuses an Initiated attempt).
 *
 * @param {"bkash"|"nagad"} provider
 * @param {string} orderNumber
 * @returns {Promise<{payment_id: string, redirect_url: string, reused: boolean}>}
 */
export async function createPayment(provider, orderNumber) {
  if (!SUPPORTED.includes(provider)) {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }
  const { data } = await api.post(`/payments/${provider}/create/`, {
    order_number: orderNumber,
  });
  return data;
}

/**
 * Ask the backend to verify a payment with the gateway. Backend will
 * internally flip the order's paid_at/paid_via if the gateway has
 * confirmed it.
 *
 * @param {"bkash"|"nagad"} provider
 * @param {string} paymentId
 * @returns {Promise<{payment_id: string, status: "Paid"|"Initiated"|"Executed"|"Failed"|"Cancelled", order: string}>}
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
 * non-terminal — in that case the order is still Pending and the user
 * can refresh the order page to retry. We don't reject on a "Failed"
 * gateway response because that's a legitimate terminal outcome the
 * caller wants to render.
 *
 * @param {"bkash"|"nagad"} provider
 * @param {string} paymentId
 * @param {{intervalMs?: number, timeoutMs?: number, signal?: AbortSignal}} [opts]
 * @returns {Promise<{status: string, payment_id: string, order: string}>}
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
        reject(new Error("Payment confirmation timed out. Please refresh the order page."));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}