import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ordersApi } from "../api";
import { useCartStore } from "../stores/cartStore";
import { useUIStore } from "../stores/uiStore";
import Icon from "../components/Icon";
import { fmt } from "../lib/format";

const STEPS = ["Shipping", "Payment", "Review"];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, shipping, tax, total, reset, fetchCart } = useCartStore();
  const notify = useUIStore((s) => s.notify);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "Bangladesh",
    phone: "",
    payment_method: "card",
    card_number: "",
    card_name: "",
    card_expiry: "",
    card_cvc: "",
  });

  if (!items.length) {
    return (
      <div className="container-page py-16 text-center">
        <Icon name="shopping_cart" size={48} className="text-ink-subtle" />
        <div className="text-headline-md text-ink mt-3">Nothing to check out</div>
        <button onClick={() => navigate("/catalog")} className="btn-primary mt-5">Browse phones</button>
      </div>
    );
  }

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const REQUIRED_FIELDS = [
    ["full_name", "Full name"],
    ["address_line1", "Address line 1"],
    ["city", "City"],
    ["state", "State / region"],
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
        city: form.city.trim(),
        state: form.state.trim(),
        postal_code: form.postal_code.trim(),
        country: (form.country || "Bangladesh").trim(),
        phone: form.phone.trim(),
      };
      const payload = {
        shipping_address: shippingAddress,
        payment_method: form.payment_method,
        notes: "",
      };
      const order = await ordersApi.checkout(payload);
      // Backend clears the cart inside the checkout transaction. Reset the
      // local store immediately so the navbar badge updates, then refetch
      // to stay in sync with the server (in case anything was added back).
      await reset();
      await fetchCart();
      notify("Order placed successfully", "success");
      navigate(`/orders/${order.order_number}`);
    } catch (e) {
      notify(extractError(e), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-page py-8">
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
          {step === 0 && (
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
                </div>
                <div>
                  <div className="label">City</div>
                  <input className="input" value={form.city} onChange={(e) => setField("city", e.target.value)} />
                </div>
                <div>
                  <div className="label">State / Province</div>
                  <input className="input" value={form.state} onChange={(e) => setField("state", e.target.value)} />
                </div>
                <div>
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
                  { v: "card", label: "Credit card", icon: "credit_card" },
                  { v: "paypal", label: "PayPal", icon: "account_balance_wallet" },
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
              {form.payment_method === "card" && (
                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  <div className="sm:col-span-2">
                    <div className="label">Card number</div>
                    <input className="input" placeholder="4242 4242 4242 4242" value={form.card_number} onChange={(e) => setField("card_number", e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="label">Name on card</div>
                    <input className="input" value={form.card_name} onChange={(e) => setField("card_name", e.target.value)} />
                  </div>
                  <div>
                    <div className="label">Expiry</div>
                    <input className="input" placeholder="MM/YY" value={form.card_expiry} onChange={(e) => setField("card_expiry", e.target.value)} />
                  </div>
                  <div>
                    <div className="label">CVC</div>
                    <input className="input" placeholder="123" value={form.card_cvc} onChange={(e) => setField("card_cvc", e.target.value)} />
                  </div>
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
                  {form.city}, {form.state} {form.postal_code}<br />
                  {form.country} · {form.phone}
                </div>
              </div>
              <div className="card p-4">
                <div className="text-label-md text-ink-muted mb-2">Payment</div>
                <div className="text-body-md text-ink">
                  {form.payment_method === "card" && `Card ending in ${form.card_number.slice(-4) || "••••"}`}
                  {form.payment_method === "paypal" && "PayPal"}
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
    </div>
  );
}