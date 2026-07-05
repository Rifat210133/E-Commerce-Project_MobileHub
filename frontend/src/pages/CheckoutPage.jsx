import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ordersApi } from "../api";
import api from "../api/client";
import { createPayment, pollUntilPaid } from "../api/payments";
import { useCartStore } from "../stores/cartStore";
import { useUIStore } from "../stores/uiStore";
import Icon from "../components/Icon";
import { fmt } from "../lib/format";

const STEPS = ["Shipping", "Payment", "Review"];

// Online payment methods that redirect to a hosted gateway page. The
// backend keeps the order Pending and flips paid_at/paid_via when the
// gateway's execute endpoint confirms. Anything not in this set is
// treated as offline (pay-on-delivery, manual mark-paid by admin).
const ONLINE_METHODS = new Set(["bkash", "nagad"]);

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, shipping, tax, total, reset, fetchCart } = useCartStore();
  const notify = useUIStore((s) => s.notify);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Drives the "Payment in progress" panel after a redirect-based
  // submit. The browser tab that holds the hosted gateway is the popup
  // window; this state is the polling loop in the main tab.
  const [pendingPayment, setPendingPayment] = useState(null);
  const [form, setForm] = useState({
    full_name: "",
    address_line1: "",
    address_line2: "",
    division: "",
    district: "",
    upazila: "",
    postal_code: "",
    country: "Bangladesh",
    phone: "",
    // "cod" is the safe default — it requires no extra UI and works
    // even if all online gateways are temporarily disabled server-side
    // via FEATURE_PAYMENT_METHODS.
    payment_method: "cod",
  });

  // Bangladesh admin-area cascade (Division → District → Upazila), fetched
  // once on mount from the same /auth/bd-geo/ endpoint the profile form uses.
  const [divisions, setDivisions] = useState([]);
  useEffect(() => {
    api.get("/auth/bd-geo/")
      .then((r) => setDivisions(r.data?.divisions || []))
      .catch(() => setDivisions([]));
  }, []);

  // Derive the available districts/upazilas for the picked division/district.
  // Stale values (e.g. user saves then later renames a district) just yield
  // an empty list, forcing them to re-pick.
  const districtsForDivision = useMemo(() => {
    if (!form.division) return [];
    return divisions.find((d) => d.name === form.division)?.districts || [];
  }, [divisions, form.division]);

  const upazilasForDistrict = useMemo(() => {
    if (!form.district) return [];
    return districtsForDivision.find((d) => d.name === form.district)?.upazilas || [];
  }, [districtsForDivision, form.district]);

  // Polling loop for the "Payment in progress" panel. Runs as long as
  // `pendingPayment` is non-null; tears itself down when the gateway
  // returns a terminal status (Paid / Failed / Cancelled) or the
  // timeout elapses. Registered BEFORE any conditional return so the
  // hook count stays stable across renders — adding hooks after an
  // early return triggers React's "fewer hooks than expected" guard.
  useEffect(() => {
    if (!pendingPayment) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await pollUntilPaid(pendingPayment.provider, pendingPayment.paymentId);
        if (cancelled) return;
        if (result.status === "Paid") {
          notify("Payment confirmed", "success");
          // The Order only exists once payment actually confirmed.
          // ``result.order`` carries the new order_number for both
          // legacy (it points to the same MH-#####) and new flows
          // (the freshly-materialised order_number).
          if (result.order) navigate(`/orders/${result.order}`);
          else navigate("/orders");
          return;
        }
        if (result.status === "Failed") {
          notify("Payment failed. You can retry from the checkout page.", "error");
        } else if (result.status === "Cancelled") {
          notify("Payment was cancelled.", "info");
        }
        // Failed / Cancelled — stay on the checkout screen with cart
        // intact so the user can pick a different method or retry.
        setPendingPayment(null);
      } catch (e) {
        if (cancelled) return;
        notify(extractError(e) || "Payment confirmation timed out. You can retry from the checkout page.", "error");
        // Same idea — keep the user on /checkout so the cart survives.
        setPendingPayment(null);
      } finally {
        // ``setPendingPayment(null)`` is called in the success path
        // above; the catch block does it too. We don't double-clear
        // here because a missing return guard would race.
        if (!cancelled) {
          // safety net for any path that fell through without
          // explicitly clearing state
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // extractError is a pure module-level helper, so omitting it from
    // the dep list is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPayment, navigate, notify]);

  // Changing a parent resets the children so we never save an inconsistent
  // (division, district, upazila) tuple.
  const onDivisionChange = (e) =>
    setForm((f) => ({ ...f, division: e.target.value, district: "", upazila: "" }));
  const onDistrictChange = (e) =>
    setForm((f) => ({ ...f, district: e.target.value, upazila: "" }));
  const onUpazilaChange = (e) => setField("upazila", e.target.value);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const REQUIRED_FIELDS = [
    ["full_name", "Full name"],
    ["address_line1", "Address line 1"],
    ["division", "Division"],
    ["district", "District"],
    ["upazila", "Upazila"],
    ["postal_code", "Postal code"],
    ["phone", "Phone"],
  ];

const extractError = (err) => {
  // DRF validation errors come back as a nested object — flatten to a readable
  // string so the toast tells the user which field is missing or invalid.
  const data = err?.response?.data;
  if (!data) return err?.message || "Checkout failed";
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  const lines = [];
  const walk = (obj, prefix = "") => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      const label = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) v.forEach((m) => lines.push(`${label}: ${m}`));
      else if (typeof v === "object") walk(v, label);
      else lines.push(`${label}: ${v}`);
    }
  };
  walk(data);
  return lines.length ? lines.join("\n") : "Checkout failed";
};

const submit = async () => {
    setSubmitting(true);
    try {
      // Surface missing fields locally before hitting the API — DRF returns a
      // 400 with a nested error blob that's hard to read in a toast.
      const missing = REQUIRED_FIELDS.filter(([key]) => !String(form[key] || "").trim());
      if (missing.length) {
        notify(`Please fill: ${missing.map(([, label]) => label).join(", ")}`, "error");
        setSubmitting(false);
        return;
      }
      const shippingAddress = {
          full_name: form.full_name.trim(),
          address_line1: form.address_line1.trim(),
          address_line2: (form.address_line2 || "").trim(),
          division: (form.division || "").trim(),
          district: (form.district || "").trim(),
          upazila: (form.upazila || "").trim(),
          postal_code: form.postal_code.trim(),
          country: (form.country || "Bangladesh").trim(),
          phone: form.phone.trim(),
        };
      const payload = {
        shipping_address: shippingAddress,
        payment_method: form.payment_method,
        notes: "",
      };
      const result = await ordersApi.checkout(payload);

      // Two response shapes depending on payment method:
      //   - COD: backend already created the Order, cleared the cart, and
      //     returned {order_number}. We reset the local cart and bounce to
      //     the order detail page.
      //   - bKash / Nagad: backend did NOT create an Order. It snapshotted
      //     the cart + shipping address onto a PaymentAttempt, opened a
      //     hosted session with the gateway, and returned
      //     {payment_id, redirect_url, draft_id, draft_number}. The cart
      //     stays intact so a cancel / abandon never costs the user their
      //     selections — they stay on this page and can retry. Only when
      //     the gateway confirms Paid does an Order get materialised.
      if (ONLINE_METHODS.has(form.payment_method)) {
        const session = result;
        if (!session?.redirect_url || !session?.payment_id) {
          notify(
            "Could not start the payment session. Please try again.",
            "error"
          );
          setSubmitting(false);
          return;
        }
        // Cart is intentionally NOT cleared here — the hosted page may
        // come back as Failed / Cancelled and we want the user to retry
        // without re-shuffling the cart.
        notify("Complete the payment in the new tab.", "info");
        const popup = window.open(session.redirect_url, "_blank", "noopener,noreferrer");
        if (!popup) {
          notify(
            "Pop-up blocked. Please allow pop-ups for this site to complete payment.",
            "error"
          );
        }
        setPendingPayment({
          provider: form.payment_method,
          paymentId: session.payment_id,
          draftId: session.draft_id,
          draftNumber: session.draft_number,
          orderNumber: null, // will be filled in once /execute materialises
        });
        // Don't navigate yet — the polling loop below routes to the new
        // /orders/<n> page when the gateway confirms.
        return;
      }

      // COD path — the Order is created and the cart cleared atomically.
      await reset();
      await fetchCart();
      notify("Order placed successfully", "success");
      navigate(`/orders/${result.order_number}`);
    } catch (e) {
      notify(extractError(e), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-page py-8">
      {items.length === 0 ? (
        <div className="py-16 text-center">
          <Icon name="shopping_cart" size={48} className="text-ink-subtle" />
          <div className="text-headline-md text-ink mt-3">Nothing to check out</div>
          <button onClick={() => navigate("/catalog")} className="btn-primary mt-5">
            Browse phones
          </button>
        </div>
      ) : (
        <>
      <div className="mb-8">
        <div className="eyebrow text-primary mb-1">Checkout</div>
        <h1 className="text-headline-lg text-ink">Secure checkout</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center mb-10">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`flex items-center gap-2 ${i <= step ? "text-primary" : "text-ink-subtle"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-label-md font-medium ${i <= step ? "bg-primary text-white" : "bg-surface-container"}`}>
                {i < step ? <Icon name="check" size={18} /> : i + 1}
              </div>
              <span className="hidden md:inline text-label-md">{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 md:w-24 h-px mx-2 ${i < step ? "bg-primary" : "bg-surface-border"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="card p-6">
          {pendingPayment && (
            <div className="space-y-4 text-center py-6">
              <Icon name="progress_activity" size={48} className="text-primary mx-auto animate-spin" />
              <div className="text-title-lg text-ink">Waiting for payment confirmation</div>
              <div className="text-body-md text-ink-muted max-w-md mx-auto">
                Complete the payment in the {pendingPayment.provider === "bkash" ? "bKash" : "Nagad"} tab that just opened.
                This page will update automatically once the gateway confirms.
              </div>
              {pendingPayment.orderNumber ? (
                <button
                  onClick={() => navigate(`/orders/${pendingPayment.orderNumber}`)}
                  className="btn-ghost mt-2"
                >
                  <Icon name="arrow_forward" size={20} /> Go to order page
                </button>
              ) : (
                <div className="text-label-md text-ink-muted">
                  Draft <span className="text-ink">{pendingPayment.draftNumber}</span>
                </div>
              )}
              <div className="pt-2">
                <button
                  onClick={() => {
                    // Manual abandon: drop the spinner, clear the
                    // PaymentAttempt from the polling loop, and stay
                    // on the checkout page so the user can retry.
                    setPendingPayment(null);
                    notify(
                      "Stopped waiting. Your cart is intact — you can retry payment or pick a different method.",
                      "info",
                    );
                  }}
                  className="text-ink-muted text-label-md hover:underline"
                >
                  Stop waiting &amp; choose a different method
                </button>
              </div>
            </div>
          )}
          {!pendingPayment && step === 0 && (
            <div className="space-y-4">
              <div className="text-title-lg text-ink mb-2">Shipping address</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <div className="label">Full name</div>
                  <input className="input" value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <div className="label">Address line 1</div>
                  <input className="input" value={form.address_line1} onChange={(e) => setField("address_line1", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <div className="label">Address line 2 (optional)</div>
                  <input className="input" value={form.address_line2} onChange={(e) => setField("address_line2", e.target.value)} />
                </div>                  {/* Bangladesh: Division → District → Upazila cascade, same
                      pattern as ProfilePage. Country stays a text input for
                      now so international addresses can still be entered by
                      hand if needed. */}
                  <div className="sm:col-span-2">
                    <div className="label">Division</div>
                    <select className="input" value={form.division} onChange={onDivisionChange}>
                      <option value="">Select division</option>
                      {divisions.map((d) => (
                        <option key={d.name} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="label">District</div>
                    <select
                      className="input"
                      value={form.district}
                      onChange={onDistrictChange}
                      disabled={!form.division || districtsForDivision.length === 0}
                    >
                      <option value="">{form.division ? "Select district" : "Pick a division first"}</option>
                      {districtsForDivision.map((d) => (
                        <option key={d.name} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="label">Upazila</div>
                    <select
                      className="input"
                      value={form.upazila}
                      onChange={onUpazilaChange}
                      disabled={!form.district || upazilasForDistrict.length === 0}
                    >
                      <option value="">{form.district ? "Select upazila" : "Pick a district first"}</option>
                      {upazilasForDistrict.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>                <div>
                  <div className="label">Postal code</div>
                  <input className="input" value={form.postal_code} onChange={(e) => setField("postal_code", e.target.value)} />
                </div>
                <div>
                  <div className="label">Country</div>
                  <input className="input" value={form.country} onChange={(e) => setField("country", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <div className="label">Phone</div>
                  <input className="input" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end pt-3">
                <button onClick={next} className="btn-primary">Continue to payment <Icon name="arrow_forward" size={20} /></button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="text-title-lg text-ink mb-2">Payment method</div>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { v: "bkash", label: "bKash", icon: "account_balance_wallet" },
                  { v: "nagad", label: "Nagad", icon: "account_balance_wallet" },
                  { v: "cod", label: "Cash on delivery", icon: "payments" },
                ].map((m) => (
                  <button
                    key={m.v}
                    onClick={() => setField("payment_method", m.v)}
                    className={`card p-4 flex items-center gap-3 text-left ${form.payment_method === m.v ? "border-primary ring-2 ring-primary/30" : ""}`}
                  >
                    <Icon name={m.icon} size={24} className="text-primary" />
                    <span className="text-body-md text-ink">{m.label}</span>
                  </button>
                ))}
              </div>
              {ONLINE_METHODS.has(form.payment_method) && (
                <div className="rounded-card border border-surface-border bg-surface-container/40 p-4 text-body-sm text-ink-muted">
                  You will be redirected to {form.payment_method === "bkash" ? "bKash" : "Nagad"} to complete
                  payment securely. The order will stay pending until the
                  gateway confirms your payment.
                </div>
              )}
              <div className="flex justify-between pt-3">
                <button onClick={back} className="btn-ghost"><Icon name="arrow_back" size={20} /> Back</button>
                <button onClick={next} className="btn-primary">Review order <Icon name="arrow_forward" size={20} /></button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-title-lg text-ink mb-2">Review & confirm</div>
              <div className="card p-4">
                <div className="text-label-md text-ink-muted mb-2">Shipping to</div>
                <div className="text-body-md text-ink">
                  {form.full_name}<br />
                  {form.address_line1}{form.address_line2 ? `, ${form.address_line2}` : ""}<br />
                  {form.upazila ? `${form.upazila}, ` : ""}{form.district ? `${form.district}, ` : ""}{form.division ? `${form.division}` : ""}<br />
                  {form.postal_code}<br />
                  {form.country} · {form.phone}
                </div>
              </div>
              <div className="card p-4">
                <div className="text-label-md text-ink-muted mb-2">Payment</div>
                <div className="text-body-md text-ink">
                  {form.payment_method === "bkash" && "bKash (online — confirmed after redirect)"}
                  {form.payment_method === "nagad" && "Nagad (online — confirmed after redirect)"}
                  {form.payment_method === "cod" && "Cash on delivery"}
                </div>
              </div>
              <div className="flex justify-between pt-3">
                <button onClick={back} className="btn-ghost"><Icon name="arrow_back" size={20} /> Back</button>
                <button onClick={submit} disabled={submitting} className="btn-gold">
                  {submitting ? <Icon name="progress_activity" className="animate-spin" size={20} /> : <Icon name="check" size={20} />}
                  Place order · {fmt.money(total)}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="card p-5 h-fit lg:sticky lg:top-20">
          <div className="text-title-lg text-ink mb-4">Order summary</div>
          <div className="space-y-3 mb-4">
            {items.map((i) => (
              <div key={i.id} className="flex gap-3 items-center">
                <img
                  src={
                    i.product.image ||
                    i.product.images?.[0] ||
                    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=200"
                  }
                  alt={i.product.name}
                  className="w-12 h-12 rounded-sm object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-label-md text-ink truncate">{i.product.name}</div>
                  <div className="text-label-sm text-ink-subtle">× {i.quantity}</div>
                </div>
                <div className="text-label-md text-ink">{fmt.money(i.subtotal)}</div>
              </div>
            ))}
          </div>
          <div className="divider mb-3" />
          <div className="space-y-1 text-body-md">
            <div className="flex justify-between"><span className="text-ink-muted">Subtotal</span><span>{fmt.money(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Shipping</span><span>{fmt.money(shipping)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Tax</span><span>{fmt.money(tax)}</span></div>
          </div>
          <div className="divider my-3" />
          <div className="flex justify-between text-title-lg">
            <span className="text-ink">Total</span>
            <span className="text-primary font-bold">{fmt.money(total)}</span>
          </div>
        </aside>
      </div>
        </>
      )}
    </div>
  );
}