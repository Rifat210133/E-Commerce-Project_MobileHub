import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import { fmt, statusColor } from "../../lib/format";
import Spinner from "../../components/Spinner";
import EmptyState from "../../components/EmptyState";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import Icon from "../../components/Icon";
import { useUIStore } from "../../stores/uiStore";

const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

// Friendly labels for `paid_via`. Values are the exact strings written by
// apps.payments (bkash / nagad) and apps.dashboard.mark_order_paid (cod).
const PAID_VIA_LABEL = {
  bkash: "bKash",
  nagad: "Nagad",
  cod: "COD",
};

function paymentLabel(o) {
  if (o.is_paid) {
    const key = (o.paid_via || o.payment_method || "").toLowerCase();
    const label = PAID_VIA_LABEL[key] || (key ? key.toUpperCase() : "");
    return label ? `Paid • ${label}` : "Paid";
  }
  if (o.payment_method === "cod") return "COD • Unpaid";
  return "—";
}

function paymentBadgeClass(o) {
  if (o.is_paid) return "bg-accent-success/15 text-accent-success";
  if (o.payment_method === "cod") return "bg-accent-warning/15 text-accent-warning";
  return "bg-surface-container text-ink-muted";
}

const VARIANT_TO_CHIP = {
  success: "chip-success",
  info: "chip-info",
  primary: "chip-primary",
  warning: "chip-warning",
  danger: "chip-danger",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const notify = useUIStore((s) => s.notify);

  const load = () => adminApi.adminOrders().then((d) => setOrders(d.results || d || []));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      if (filter && o.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const recipient = o.shipping_address?.full_name || "";
        return o.order_number.toLowerCase().includes(q) || recipient.toLowerCase().includes(q);
      }
      return true;
    });
  }, [orders, filter, search]);

  const open = (o) => {
    setEditing(o);
    setStatus(o.status);
    setNote("");
  };

  const save = async () => {
      // Server stores status in TitleCase (Order.STATUS_CHOICES), but the chip
      // UI uses lowercase. Capitalize before sending so the backend's
      // VALID_STATUSES check accepts the value.
      const payload = { status: status.charAt(0).toUpperCase() + status.slice(1) };
      if (note.trim()) payload.status_notes = note.trim();
      await adminApi.updateOrderStatus(editing.id, payload);
    setEditing(null);
    load();
  };

  const markPaid = async (o) => {
    try {
      await adminApi.markOrderPaid(o.id);
      notify(`Order #${o.order_number} marked as paid.`, "success");
      load();
    } catch (e) {
      const detail = e?.response?.data?.detail || "Could not mark order as paid.";
      notify(detail, "error");
    }
  };

  if (orders === null) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow text-primary mb-1">Operations</div>
          <h1 className="text-headline-md text-ink">Orders</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={18} />
            <input className="input pl-10 !py-2 w-64" placeholder="Search by order # or name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input !py-2 w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState icon="receipt_long" title="No orders match" message="Try clearing your filters." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-md">
              <thead className="bg-surface-alt text-label-md text-ink-muted uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Payment</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((o) => (
                  <tr key={o.order_number} className="hover:bg-surface-alt/60">
                    <td className="px-4 py-3 font-medium text-ink">#{o.order_number}</td>
                    <td className="px-4 py-3 text-ink-muted">{o.shipping_address?.full_name || "—"}</td>
                    <td className="px-4 py-3 text-ink-muted">{fmt.date(o.created_at)}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{fmt.money(o.total_amount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3">
                      <span className={`badge ${paymentBadgeClass(o)}`}>{paymentLabel(o)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        {o.payment_method === "cod" && !o.is_paid && (
                          <button
                            onClick={() => markPaid(o)}
                            className="text-accent-success text-label-md font-medium hover:underline"
                          >
                            Mark paid
                          </button>
                        )}
                        <button onClick={() => open(o)} className="text-primary text-label-md font-medium hover:underline">Update</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Update order #${editing.order_number}` : ""} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`chip ${status === s ? VARIANT_TO_CHIP[statusColor(s)] : "bg-surface-alt text-ink-muted"} border border-transparent capitalize`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Internal note (optional)</label>
            <textarea className="input min-h-[80px]" placeholder="Log a note about this update…" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditing(null)} className="btn-outline">Cancel</button>
            <button onClick={save} className="btn-primary">Save changes</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}