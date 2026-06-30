import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../../api";
import { fmt } from "../../lib/format";
import { useUIStore } from "../../stores/uiStore";
import Spinner from "../../components/Spinner";
import EmptyState from "../../components/EmptyState";
import Icon from "../../components/Icon";
import Modal from "../../components/Modal";

// All statuses ReturnRequest can be in. Matches the backend choices exactly.
const STATUSES = ["Requested", "Approved", "Rejected", "Refunded", "Cancelled"];

// Per-status pill colors. Statuses are TitleCase server-side.
const STATUS_PILL = {
  Requested: "bg-accent-warning/15 text-accent-warning",
  Approved: "bg-accent-info/15 text-accent-info",
  Rejected: "bg-accent-danger/15 text-accent-danger",
  Refunded: "bg-accent-success/15 text-accent-success",
  Cancelled: "bg-surface-container text-ink-muted",
};

function StatusPill({ status }) {
  return (
    <span className={`badge ${STATUS_PILL[status] || STATUS_PILL.Cancelled}`}>
      {status}
    </span>
  );
}

function ItemThumb({ item }) {
  if (item.image) {
    return (
      <img
        src={item.image}
        alt={item.product_name}
        className="w-10 h-10 rounded object-cover bg-surface-alt border border-surface-border"
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded bg-surface-alt border border-surface-border flex items-center justify-center">
      <Icon name="smartphone" size={20} className="text-ink-muted" />
    </div>
  );
}

function ReturnSummary({ rr }) {
  const items = rr.items || [];
  const first = items[0];
  const more = items.length - 1;
  if (!first) {
    return <span className="text-ink-muted">No items</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <ItemThumb item={first} />
      <div className="min-w-0">
        <div className="font-medium text-ink truncate max-w-[16rem]">
          {first.product_name}{" "}
          <span className="text-ink-muted">×{first.quantity_returned}</span>
        </div>
        {more > 0 && (
          <div className="text-label-sm text-ink-muted">+{more} more item{more === 1 ? "" : "s"}</div>
        )}
      </div>
    </div>
  );
}

export default function AdminReturns() {
  const notify = useUIStore((s) => s.notify);

  const [data, setData] = useState(null);
  const [status, setStatus] = useState("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const [active, setActive] = useState(null); // ReturnRequest being managed
  const [adminNote, setAdminNote] = useState("");

  // Deep-link support: a notification can land here with ?id=<return_id> and
  // we want the manage modal to open automatically on that exact row.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkId = searchParams.get("id");
  // Track which deep-link id we've already honored so we don't re-open the
  // modal on every data refresh (status filter change, note save, etc.).
  const openedDeepLinkRef = useRef(null);

  const load = () => {
    setData(null);
    const params = {};
    if (status !== "All") params.status = status;
    adminApi
      .adminReturns(params)
      .then((d) => setData(d.results || d || []))
      .catch((err) => {
        setData([]);
        notify(err?.response?.data?.detail || "Failed to load returns.", "danger");
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Honor ?id=<return_id> deep links: once the list finishes loading,
  // open the modal for that return. If the requested id isn't in the
  // currently-filtered list, fetch it directly so we can still open it
  // (and reset the status filter to "All" so the row is visible behind
  // the modal).
  useEffect(() => {
    if (!deepLinkId) return;
    if (openedDeepLinkRef.current === deepLinkId) return;
    if (!data) return;

    const target = data.find((r) => String(r.id) === String(deepLinkId));
    if (target) {
      openedDeepLinkRef.current = deepLinkId;
      // Make sure the status pill matches this row's status so the admin
      // sees which bucket the deep-linked return belongs to.
      if (status !== target.status) setStatus(target.status);
      openManage(target);
      return;
    }

    // Row is filtered out (or was paginated away). Fetch it on its own.
    let cancelled = false;
    adminApi
      .adminReturnDetail(deepLinkId)
      .then((rr) => {
        if (cancelled) return;
        openedDeepLinkRef.current = deepLinkId;
        // Sync the status pill to the row's actual status so the deep-
        // linked return shows up underneath the modal in its bucket.
        if (status !== rr.status) setStatus(rr.status);
        openManage(rr);
      })
      .catch(() => {
        // Surface a soft error and clear the bad id so we don't loop.
        notify("That return request could not be loaded.", "danger");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("id");
            return next;
          },
          { replace: true }
        );
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, deepLinkId]);

  // Sync ?id= with the modal: open the modal manually -> set id; close -> clear.
  useEffect(() => {
    const current = searchParams.get("id");
    if (active && String(active.id) !== current) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("id", String(active.id));
          return next;
        },
        { replace: true }
      );
    } else if (!active && current) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("id");
          return next;
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (!q) return data;
    const s = q.toLowerCase();
    return data.filter((r) =>
      [r.order_number, r.user_email, r.user_name, r.reason]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [data, q]);

  const counts = useMemo(() => {
    const c = { All: (data || []).length };
    for (const s of STATUSES) {
      c[s] = (data || []).filter((r) => r.status === s).length;
    }
    return c;
  }, [data]);

  const openManage = (rr) => {
    setActive(rr);
    setAdminNote(rr.admin_note || "");
  };

  const closeManage = () => {
    if (busy) return;
    setActive(null);
    setAdminNote("");
  };

  const saveNote = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await adminApi.updateReturnAdminNote(active.id, adminNote);
      notify("Note saved.", "success");
      const updated = { ...active, admin_note: adminNote };
      setActive(updated);
      setData((prev) =>
        prev ? prev.map((r) => (r.id === active.id ? { ...r, admin_note: adminNote } : r)) : prev
      );
    } catch (err) {
      notify(err?.response?.data?.detail || "Could not save note.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (action, successMsg, errorPrefix) => {
    if (!active) return;
    setBusy(true);
    try {
      const fn =
        action === "approve"
          ? adminApi.approveReturn
          : action === "reject"
          ? adminApi.rejectReturn
          : adminApi.refundReturn;
      const updated = await fn(active.id, adminNote);
      notify(successMsg, "success");
      setData((prev) =>
        prev ? prev.map((r) => (r.id === active.id ? updated : r)) : prev
      );
      setActive(updated);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.status?.[0] ||
        err?.response?.data?.error;
      notify(detail || `${errorPrefix} failed.`, "danger");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!active) return;
    if (!confirm(`Permanently delete return #${active.id}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await adminApi.deleteReturn(active.id);
      notify("Return deleted.", "success");
      setData((prev) => (prev ? prev.filter((r) => r.id !== active.id) : prev));
      setActive(null);
      setAdminNote("");
    } catch (err) {
      notify(err?.response?.data?.detail || "Delete failed.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow text-primary mb-1">After-sales</div>
          <h1 className="text-headline-md text-ink">Return requests</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Review, approve, reject, and refund customer return requests.
          </p>
        </div>
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
            size={18}
          />
          <input
            className="input pl-10 !py-2 w-72"
            placeholder="Search by order #, customer, or reason"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {["All", ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-label-md border transition-colors ${
              status === s
                ? "bg-primary text-white border-primary"
                : "bg-white text-ink-muted border-surface-border hover:text-ink"
            }`}
          >
            {s}
            {data && (
              <span
                className={`ml-2 px-1.5 rounded-full text-label-sm ${
                  status === s ? "bg-white/20 text-white" : "bg-surface-alt text-ink-muted"
                }`}
              >
                {counts[s] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {data === null ? (
        <Spinner />
      ) : !rows.length ? (
        <EmptyState
          icon="undo"
          title="No return requests"
          message={
            status === "All"
              ? "When customers file return requests, they’ll appear here."
              : `No requests in "${status}" status.`
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-md">
              <thead className="bg-surface-alt text-label-md text-ink-muted uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Items</th>
                  <th className="text-left px-4 py-3">Requested</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-alt/60">
                    <td className="px-4 py-3">
                      <Link
                        to={`/orders/${r.order_number}`}
                        className="font-medium text-primary hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        #{r.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{r.user_name}</div>
                      <div className="text-label-sm text-ink-muted">{r.user_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <ReturnSummary rr={r} />
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{fmt.relative(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openManage(r)}
                        className="btn-outline !py-1.5 !px-3"
                      >
                        <Icon name="more_horiz" size={18} />
                        <span className="ml-1">Manage</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manage modal */}
      <Modal
        open={!!active}
        onClose={closeManage}
        title={active ? `Return request #${active.id}` : "Return request"}
        size="lg"
        footer={
          active && (
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={onDelete}
                disabled={busy}
                className="btn-outline !py-2 !px-3 text-accent-danger border-accent-danger/40 hover:bg-accent-danger/10"
              >
                <Icon name="delete" size={18} />
                <span className="ml-1">Delete</span>
              </button>
              <div className="flex flex-wrap gap-2">
                {active.status === "Requested" && (
                  <>
                    <button
                      onClick={() => transition("reject", "Return rejected.", "Reject")}
                      disabled={busy}
                      className="btn-outline !py-2 !px-3"
                    >
                      <Icon name="block" size={18} />
                      <span className="ml-1">Reject</span>
                    </button>
                    <button
                      onClick={() => transition("approve", "Return approved.", "Approve")}
                      disabled={busy}
                      className="btn-primary !py-2 !px-3"
                    >
                      <Icon name="check" size={18} />
                      <span className="ml-1">Approve</span>
                    </button>
                  </>
                )}
                {active.status === "Approved" && (
                  <button
                    onClick={() =>
                      transition("refund", "Refund recorded and stock restored.", "Refund")
                    }
                    disabled={busy}
                    className="btn-primary !py-2 !px-3"
                  >
                    <Icon name="payments" size={18} />
                    <span className="ml-1">Mark refunded</span>
                  </button>
                )}
                {["Rejected", "Refunded", "Cancelled"].includes(active.status) && (
                  <button onClick={closeManage} className="btn-outline !py-2 !px-3">
                    Close
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {active && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card !p-3">
                <div className="text-label-sm text-ink-muted">Order</div>
                <Link
                  to={`/orders/${active.order_number}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary font-medium hover:underline"
                >
                  #{active.order_number}
                </Link>
              </div>
              <div className="card !p-3">
                <div className="text-label-sm text-ink-muted">Customer</div>
                <div className="font-medium text-ink">{active.user_name}</div>
                <div className="text-label-sm text-ink-muted">{active.user_email}</div>
              </div>
              <div className="card !p-3">
                <div className="text-label-sm text-ink-muted">Status</div>
                <div className="mt-1">
                  <StatusPill status={active.status} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-label-md text-ink-muted mb-2">Items</div>
              <ul className="divide-y divide-surface-border border border-surface-border rounded-md overflow-hidden">
                {(active.items || []).map((it, idx) => (
                  <li key={`${it.product_id}-${idx}`} className="flex items-center gap-3 p-3 bg-white">
                    <ItemThumb item={it} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink truncate">{it.product_name}</div>
                      <div className="text-label-sm text-ink-muted">
                        Qty returned: {it.quantity_returned}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-label-md text-ink-muted mb-1">Customer reason</div>
              <div className="p-3 rounded-md bg-surface-alt text-body-md text-ink whitespace-pre-wrap">
                {active.reason}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-label-md text-ink-muted">Admin note</div>
                <button
                  onClick={saveNote}
                  disabled={busy || (active.admin_note || "") === adminNote}
                  className="btn-outline !py-1.5 !px-3 text-label-md"
                >
                  <Icon name="save" size={16} />
                  <span className="ml-1">Save note</span>
                </button>
              </div>
              <textarea
                rows={3}
                className="input w-full"
                placeholder="Internal note for this request (visible to admins and shared with the customer on decisions)"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-label-sm text-ink-muted">
              <div>Requested: {fmt.dateLong(active.created_at)}</div>
              <div>Updated: {fmt.dateLong(active.updated_at)}</div>
              {active.decided_at && <div>Decided: {fmt.dateLong(active.decided_at)}</div>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}