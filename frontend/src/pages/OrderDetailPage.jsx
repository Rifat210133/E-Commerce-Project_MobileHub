import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ordersApi, policiesApi, recsApi, returnsApi } from "../api";
import { useUIStore } from "../stores/uiStore";
import Spinner from "../components/Spinner";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { fmt } from "../lib/format";

const TIMELINE = ["pending", "confirmed", "processing", "shipped", "delivered"];

// Centralizes the label/icon for the order detail page's Payment block
// so adding a new provider is a one-line change. Returns null when the
// method is unknown so we fall through to the unpaid-warning branch.
function PaymentBadge({ method }) {
  if (method === "bkash") {
    return (
      <div className="flex items-center gap-2 text-body-md text-ink-muted">
        <Icon name="account_balance_wallet" />
        <span>bKash</span>
      </div>
    );
  }
  if (method === "nagad") {
    return (
      <div className="flex items-center gap-2 text-body-md text-ink-muted">
        <Icon name="account_balance_wallet" />
        <span>Nagad</span>
      </div>
    );
  }
  if (method === "cod") {
    return (
      <div className="flex items-center gap-2 text-body-md text-ink-muted">
        <Icon name="payments" />
        <span>Cash on delivery</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-body-md text-ink-muted">
      <Icon name="account_balance_wallet" />
      <span className="capitalize">{(method || "card").replace(/_/g, " ")}</span>
    </div>
  );
}

function Timeline({ status }) {
  const idx = TIMELINE.indexOf(status);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {TIMELINE.map((s, i) => {
          const active = i <= idx;
          const current = i === idx;
          return (
            <div key={s} className="flex-1 min-w-[80px] text-center">
              <div className={`mx-auto w-9 h-9 rounded-full flex items-center justify-center mb-2 ${active ? "bg-primary text-white" : "bg-surface-alt text-ink-subtle"} ${current ? "ring-4 ring-primary-100" : ""}`}>
                <Icon name={i <= 1 ? "check" : i === 2 ? "package_2" : i === 3 ? "local_shipping" : "done_all"} size={18} />
              </div>
              <div className={`text-label-sm capitalize ${active ? "text-ink font-medium" : "text-ink-subtle"}`}>{s}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RETURN_STATUS_META = {
  Requested: { tone: "info", label: "Awaiting review" },
  Approved: { tone: "warning", label: "Approved — pending refund" },
  Rejected: { tone: "danger", label: "Rejected" },
  Refunded: { tone: "success", label: "Refunded" },
  Cancelled: { tone: "muted", label: "Cancelled by you" },
};

function ReturnStatusPill({ status }) {
  const meta = RETURN_STATUS_META[status] || { tone: "muted", label: status };
  const toneClass = {
    info: "bg-primary-50 text-primary",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    success: "bg-emerald-50 text-emerald-700",
    muted: "bg-surface-alt text-ink-muted",
  }[meta.tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label-sm font-medium ${toneClass}`}>
      {meta.label}
    </span>
  );
}

function quantityAlreadyReturned(returns, productId) {
  let total = 0;
  for (const r of returns || []) {
    if (r.status === "Cancelled") continue;
    for (const line of r.items || []) {
      if (line.product_id === productId) {
        total += Number(line.quantity_returned || 0);
      }
    }
  }
  return total;
}

function RequestReturnModal({ open, onClose, order, returns, onSubmitted }) {
  const pushToast = useUIStore((s) => s.pushToast);
  const lines = useMemo(() => {
    if (!order) return [];
    return (order.items || [])
      .map((it) => {
        const already = quantityAlreadyReturned(returns, it.product_id);
        const remaining = Math.max(Number(it.quantity || 0) - already, 0);
        return { ...it, remaining };
      })
      .filter((it) => it.remaining > 0);
  }, [order, returns]);

  const [qty, setQty] = useState({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setQty({});
      setReason("");
    }
  }, [open]);

  if (!order) return null;

  const selectedLines = lines
    .map((l) => ({ ...l, qty: qty[l.product_id] || 0 }))
    .filter((l) => l.qty > 0);
  const canSubmit =
    selectedLines.length > 0 && reason.trim().length >= 10 && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        reason: reason.trim(),
        items: selectedLines.map((l) => ({
          product_id: l.product_id,
          quantity_returned: l.qty,
        })),
      };
      const created = await returnsApi.create(order.order_number, payload);
      pushToast({ message: "Return request submitted.", variant: "success" });
      onSubmitted?.(created);
      onClose?.();
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.reason?.[0] ||
        err?.message ||
        "Could not submit the return request.";
      pushToast({ message: detail, variant: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  const setLineQty = (productId, value, max) => {
    const n = Math.max(0, Math.min(max, Number(value) || 0));
    setQty((q) => ({ ...q, [productId]: n }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Request a return for #${order.order_number}`}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-outline !py-2 !px-3">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit return request"}
          </button>
        </>
      }
    >
      {lines.length === 0 ? (
        <div className="text-center py-8 text-body-md text-ink-muted">
          All items in this order have already been returned. There's
          nothing left to return.
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-body-md text-ink-muted">
            Pick how many of each item you want to return, then tell us
            why. We review requests within one business day.
          </p>

          <div className="divide-y divide-surface-border border border-surface-border rounded-md">
            {lines.map((it) => {
              const value = qty[it.product_id] || 0;
              return (
                <div key={it.product_id} className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-md bg-surface-alt overflow-hidden flex items-center justify-center shrink-0">
                    {it.image ? (
                      <img src={it.image} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <Icon name="smartphone" className="text-ink-subtle" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-title-md text-ink line-clamp-1">
                      {it.product_name}
                    </div>
                    <div className="text-label-sm text-ink-muted">
                      Ordered {it.quantity} · {it.remaining} eligible to return
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLineQty(it.product_id, value - 1, it.remaining)}
                      disabled={value <= 0}
                      className="w-8 h-8 rounded-full border border-surface-border disabled:opacity-40"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={it.remaining}
                      value={value}
                      onChange={(e) => setLineQty(it.product_id, e.target.value, it.remaining)}
                      className="w-14 text-center input !py-1.5"
                    />
                    <button
                      type="button"
                      onClick={() => setLineQty(it.product_id, value + 1, it.remaining)}
                      disabled={value >= it.remaining}
                      className="w-8 h-8 rounded-full border border-surface-border disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <label className="text-label-md text-ink-muted block mb-1">
              Reason for return (required, min 10 characters)
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us what went wrong — was it damaged, the wrong model, or just not what you expected?"
              className="input"
            />
            <div className="text-label-sm text-ink-subtle mt-1">
              {reason.trim().length}/10 minimum characters
            </div>
          </div>

          {selectedLines.length === 0 && (
            <div className="text-label-md text-ink-muted">
              Select at least one item above to continue.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ExistingReturnCard({ r, onCancelled }) {
  const pushToast = useUIStore((s) => s.pushToast);
  const canCancel = r.status === "Requested";

  const cancel = async () => {
    if (!confirm("Cancel this return request? This cannot be undone.")) return;
    try {
      const updated = await returnsApi.cancel(r.id);
      pushToast({ message: "Return request cancelled.", variant: "success" });
      onCancelled?.(updated);
    } catch (err) {
      pushToast({
        message: err?.response?.data?.detail || "Could not cancel.",
        variant: "danger",
      });
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-title-md text-ink">Return #{r.id}</span>
            <ReturnStatusPill status={r.status} />
          </div>
          <div className="text-label-md text-ink-muted mt-1">
            Requested {fmt.dateLong(r.created_at)}
          </div>
        </div>
        {canCancel && (
          <button onClick={cancel} className="btn-outline !py-1.5 !px-2 text-label-sm">
            Cancel
          </button>
        )}
      </div>
      <ul className="mt-3 text-body-md text-ink space-y-1">
        {(r.items || []).map((it) => (
          <li key={it.product_id} className="flex justify-between gap-2">
            <span className="line-clamp-1">{it.product_name}</span>
            <span className="text-ink-muted shrink-0">× {it.quantity_returned}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-body-md text-ink-muted">
        <span className="text-ink font-medium">Reason:</span> {r.reason}
      </p>
      {r.admin_note && (
        <p className="mt-2 text-body-md text-ink-muted">
          <span className="text-ink font-medium">From our team:</span> {r.admin_note}
        </p>
      )}
    </div>
  );
}

export default function OrderDetailPage() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [returns, setReturns] = useState([]);
  const [video, setVideo] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingReceived, setConfirmingReceived] = useState(false);
  const pushToast = useUIStore((s) => s.pushToast);

  const confirmReceived = async () => {
    if (confirmingReceived) return;
    setConfirmingReceived(true);
    try {
      const updated = await ordersApi.confirmReceived(orderNumber);
      setOrder(updated);
      pushToast({
        message: "Thanks! Your order has been marked as received.",
        variant: "success",
      });
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Could not confirm receipt. Please try again.";
      pushToast({ message: detail, variant: "danger" });
    } finally {
      setConfirmingReceived(false);
    }
  };

  const fetchAll = () => {
    ordersApi.getOrder(orderNumber).then(setOrder);
    returnsApi.listForOrder(orderNumber).then(setReturns).catch(() => setReturns([]));
  };

  useEffect(() => {
    fetchAll();
    // Load the active return policy so the eligibility hint can mirror
    // the backend's window rules. Backend may be unreachable in dev —
    // we just leave policy=null and the panel will show a generic msg.
    policiesApi
      .list()
      .then((d) => {
        const active = (d || []).find((p) => p.is_active) || (d || [])[0] || null;
        setPolicy(active);
      })
      .catch(() => setPolicy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  // The hosted payment tab finishes in a separate window. When it closes
  // (or the user comes back to this tab) we re-fetch so paid_at flips
  // from null → set without needing a manual reload. The popup's
  // success page also does window.opener.location.replace(...) which
  // already triggers this, but listening here covers the case where the
  // user closes the popup manually instead of clicking the success page.
  useEffect(() => {
    const refresh = () => fetchAll();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  useEffect(() => {
    if (order?.items?.[0]?.product_slug) {
        recsApi.youtube(order.items[0].product_slug).then((d) => {
          if (d?.videos?.[0]) setVideo(d.videos[0]);
        }).catch(() => {});
      }
  }, [order]);

  const eligibility = useMemo(() => {
    if (!order) return { eligible: false, reason: "" };
    // Both "Delivered" and "Received" orders are eligible for returns.
    // Receipt confirmation just closes the customer's lifecycle; the
    // return-policy window keeps ticking either way.
    if (!["Delivered", "Received"].includes(order.status)) {
      return { eligible: false, reason: "Only delivered orders can be returned." };
    }
    if (!policy) {
      return { eligible: false, reason: "No active return policy found." };
    }
    const anchorIso = order.delivered_at || order.created_at;
    if (!anchorIso) {
      return { eligible: false, reason: "Missing delivery date." };
    }
    const anchor = new Date(anchorIso);
    const deadline = new Date(anchor.getTime() + policy.return_window_days * 86400000);
    if (Date.now() > deadline.getTime()) {
      return {
        eligible: false,
        reason: `The ${policy.return_window_days}-day return window has passed.`,
      };
    }
    const anyRemaining = (order.items || []).some((it) => {
      const already = quantityAlreadyReturned(returns, it.product_id);
      return Number(it.quantity || 0) - already > 0;
    });
    if (!anyRemaining) {
      return { eligible: false, reason: "All items in this order have been returned." };
    }
    return {
      eligible: true,
      reason: "",
      deadline,
      windowDays: policy.return_window_days,
    };
  }, [order, policy, returns]);

  if (!order) return <Spinner />;

  const addr = order.shipping_address || {};

  return (
    <div className="container-page py-8">
      <div className="flex items-center gap-3 text-label-md text-ink-muted mb-4">
        <Link to="/orders" className="hover:text-primary inline-flex items-center gap-1">
          <Icon name="arrow_back" size={16} /> Orders
        </Link>
        <Icon name="chevron_right" size={14} />
        <span className="text-ink">#{order.order_number}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="eyebrow text-primary mb-1">Placed {fmt.dateLong(order.created_at)}</div>
          <h1 className="text-headline-lg text-ink">Order #{order.order_number}</h1>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Timeline status={order.status} />

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-border">
              <h2 className="text-title-md text-ink">Items</h2>
            </div>
            <ul className="divide-y divide-surface-border">
              {order.items?.map((it) => (
                  <li key={it.product_id ?? `${it.product_slug}-${it.quantity}`} className="p-5 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-md bg-surface-alt flex items-center justify-center overflow-hidden">
                      {it.image ? <img src={it.image} className="w-full h-full object-cover" alt="" /> : <Icon name="smartphone" className="text-ink-subtle" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link to={`/product/${it.product_slug}`} className="text-title-md text-ink hover:text-primary line-clamp-1">{it.product_name}</Link>
                      <div className="text-label-md text-ink-muted">Qty {it.quantity}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-title-md text-ink">{fmt.money(it.subtotal)}</div>
                      <div className="text-label-sm text-ink-subtle">{fmt.money(it.price)} ea</div>
                    </div>
                  </li>
                ))}
            </ul>
          </div>

          {video && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
                <Icon name="play_circle" className="text-primary" />
                <h2 className="text-title-md text-ink">Featured video</h2>
              </div>
              <div className="aspect-video bg-ink">
                <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${video.video_id}?autoplay=0`} title={video.title} allowFullScreen />
              </div>
              <div className="p-4">
                <div className="text-title-md text-ink line-clamp-2">{video.title}</div>
                <div className="text-label-md text-ink-muted mt-1">{video.channel_title}</div>
              </div>
            </div>
          )}

          {(returns || []).length > 0 && (
            <div className="space-y-3">
              <h2 className="text-title-lg text-ink">Returns on this order</h2>
              {returns.map((r) => (
                <ExistingReturnCard
                  key={r.id}
                  r={r}
                  onCancelled={(updated) =>
                    setReturns((curr) =>
                      curr.map((c) => (c.id === updated.id ? updated : c))
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-title-md text-ink mb-3">Shipping address</h3>
            <div className="text-body-md text-ink-muted space-y-1">
              <div className="text-ink font-medium">{order.recipient_name || addr.full_name}</div>
                <div>{addr.address_line1}</div>
                {addr.address_line2 && <div>{addr.address_line2}</div>}
                <div>{addr.city}, {addr.state} {addr.postal_code}</div>
                <div>{addr.country}</div>
              {addr.phone && <div className="pt-2">{addr.phone}</div>}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-title-md text-ink mb-3">Payment</h3>
            <PaymentBadge
              method={addr.payment_method || order.payment_method}
              paidAt={order.paid_at}
            />
            {order.is_paid ? (
              <div className="mt-3 flex items-center gap-2 text-label-md text-accent-success">
                <Icon name="verified" size={18} />
                <span>Paid on {fmt.dateLong(order.paid_at)}</span>
              </div>
            ) : (addr.payment_method || order.payment_method) === "cod" ? (
              <div className="mt-3 flex items-center gap-2 text-label-md text-accent-warning">
                <Icon name="hourglass_top" size={18} />
                <span>Unpaid — pay on delivery</span>
              </div>
            ) : (addr.payment_method || order.payment_method) === "bkash" ||
              (addr.payment_method || order.payment_method) === "nagad" ? (
              <div className="mt-3 flex items-center gap-2 text-label-md text-accent-warning">
                <Icon name="hourglass_top" size={18} />
                <span>Unpaid — awaiting gateway confirmation</span>
              </div>
            ) : null}
          </div>

          <div className="card p-5">
              <h3 className="text-title-md text-ink mb-3">Summary</h3>
              <dl className="text-body-md space-y-2">
                <Row label="Subtotal" value={fmt.money(order.subtotal ?? 0)} />
                <Row label="Shipping" value={fmt.money(order.shipping_fee ?? order.shipping ?? 0)} />
                <Row label="Tax" value={fmt.money(order.tax ?? 0)} />
                <div className="border-t border-surface-border pt-2">
                  <Row label="Total" value={fmt.money(order.total_amount ?? order.total ?? 0)} bold />
                </div>
              </dl>
            </div>

          {order.status === "Delivered" && (
            <div className="card p-5 bg-emerald-50 border border-emerald-200">
              <div className="flex items-start gap-3">
                <Icon name="task_alt" className="text-emerald-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-title-md text-ink">Have you received it?</h3>
                  <p className="text-body-md text-ink-muted mt-1">
                    Confirm receipt so we can close out your delivery. The
                    return window stays open for the same period regardless.
                  </p>
                  <button
                    onClick={confirmReceived}
                    disabled={confirmingReceived}
                    className="btn-primary !py-2 !px-4 mt-3 disabled:opacity-60"
                  >
                    {confirmingReceived ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner size="xs" /> Confirming…
                      </span>
                    ) : (
                      <>
                        <Icon name="check_circle" size={16} className="-ml-1 mr-1.5" />
                        Yes, I received my order
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {order.status === "Received" && (
            <div className="card p-5 bg-emerald-50 border border-emerald-200">
              <div className="flex items-start gap-3">
                <Icon name="verified" className="text-emerald-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-title-md text-ink">Delivery complete</h3>
                  <p className="text-body-md text-ink-muted mt-1">
                    You confirmed receipt on{" "}
                    {fmt.dateLong(order.received_at)}. Thanks for shopping
                    with MobileHub!
                  </p>
                </div>
              </div>
            </div>
          )}

          {eligibility.eligible ? (
            <div className="card p-5 bg-surface border border-line">
              <div className="flex items-start gap-3">
                <Icon name="undo" className="text-primary mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-title-md text-ink">Need to return something?</h3>
                  <p className="text-body-md text-ink-muted mt-1">
                    You can request a return within {eligibility.windowDays} day(s)
                    of delivery (until {fmt.dateLong(eligibility.deadline)}).
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setModalOpen(true)}
                      className="btn-primary !py-2 !px-3"
                    >
                      Request a return
                    </button>
                    <Link
                      to="/return-policy"
                      className="btn-outline !py-2 !px-3"
                    >
                      Read policy
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            ["processing", "shipped", "delivered", "received"].includes(
              order.status
            ) && (
              <div className="card p-5 bg-surface border border-line">
                <div className="flex items-start gap-3">
                  <Icon name="undo" className="text-primary mt-0.5" />
                  <div>
                    <h3 className="text-title-md text-ink">Returns</h3>
                    <p className="text-body-md text-ink-muted mt-1">
                      {eligibility.reason}
                    </p>
                    <Link
                      to="/return-policy"
                      className="mt-2 inline-flex text-label-md text-primary hover:underline"
                    >
                      Read return policy →
                    </Link>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <RequestReturnModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        order={order}
        returns={returns}
        onSubmitted={() => fetchAll()}
      />
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? "text-ink font-semibold" : "text-ink-muted"}`}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>
  );
}