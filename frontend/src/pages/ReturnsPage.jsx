import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { returnsApi } from "../api";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/Icon";
import { fmt } from "../lib/format";

// Map return-status to a friendly colour accent. We reuse the same
// green/amber/red semantics as the order status badge so the UI stays
// consistent.
const STATUS_META = {
  Requested: { tone: "info", icon: "schedule", label: "Awaiting review" },
  Approved: { tone: "warning", icon: "thumb_up", label: "Approved — pending refund" },
  Rejected: { tone: "danger", icon: "block", label: "Rejected" },
  Refunded: { tone: "success", icon: "verified", label: "Refunded" },
  Cancelled: { tone: "muted", icon: "undo", label: "Cancelled by you" },
};

function ReturnStatusBadge({ status }) {
  const meta = STATUS_META[status] || { tone: "muted", icon: "help" };
  // Reuse StatusBadge for known statuses (Delivered/Pending etc) by passing
  // through a fallback tone — but it's simpler/clearer to render our own
  // pill here since return statuses aren't in the order enum.
  const toneClass = {
    info: "bg-primary-50 text-primary",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    success: "bg-emerald-50 text-emerald-700",
    muted: "bg-surface-alt text-ink-muted",
  }[meta.tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label-md font-medium ${toneClass}`}>
      <Icon name={meta.icon} size={14} />
      {meta.label}
    </span>
  );
}

function ReturnRow({ r, highlight }) {
  const itemsSummary = (r.items || [])
    .slice(0, 3)
    .map((it) => `${it.quantity_returned} × ${it.product_name}`)
    .join(", ");
  const more = (r.items?.length || 0) > 3 ? ` +${r.items.length - 3} more` : "";
  return (
    <Link
      to={`/orders/${r.order_number}`}
      data-return-id={r.id}
      className={`card card-hover p-5 flex items-center gap-4 ${
        highlight ? "ring-2 ring-primary/60 bg-primary/5" : ""
      }`}
    >
      <div className="w-12 h-12 rounded-full bg-primary-50 text-primary flex items-center justify-center">
        <Icon name="undo" size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-title-md text-ink">
          Return for #{r.order_number}
        </div>
        <div className="text-label-md text-ink-muted mt-0.5 line-clamp-1">
          {itemsSummary}
          {more}
        </div>
        <div className="text-label-sm text-ink-subtle mt-1">
          Requested {fmt.dateLong(r.created_at)}
        </div>
      </div>
      <div className="text-right flex flex-col items-end gap-1">
        <ReturnStatusBadge status={r.status} />
        <div className="text-label-sm text-ink-muted">
          {r.total_quantity} item{r.total_quantity === 1 ? "" : "s"}
        </div>
      </div>
      <Icon name="chevron_right" className="text-ink-subtle" />
    </Link>
  );
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState(null);

  // Honor ?id=<return_id> from a notification deep-link: once the list
  // is loaded, find the matching row and scroll it into view.
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("id");
  const highlightRowRef = useRef(null);

  useEffect(() => {
    returnsApi.listMine().then((d) => setReturns(d || []));
  }, []);

  useEffect(() => {
    if (!highlightId || !returns) return;
    const node = document.querySelector(`[data-return-id="${highlightId}"]`);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returns, highlightId]);

  if (returns === null) return <Spinner />;

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow text-primary mb-1">My returns</div>
          <h1 className="text-headline-lg text-ink">Return requests</h1>
          <p className="text-body-md text-ink-muted mt-1 max-w-xl">
            Track returns you've filed for delivered orders. Tap any row
            to view the originating order — refunds are processed once
            our team has reviewed your request.
          </p>
        </div>
        <Link to="/orders" className="btn-outline !py-2 !px-3">
          <Icon name="receipt_long" size={18} />
          <span className="ml-1">My orders</span>
        </Link>
      </div>

      {returns.length === 0 ? (
        <EmptyState
          icon="undo"
          title="No return requests"
          message="You haven't filed a return yet. Open a delivered order to start one."
          action={
            <Link to="/orders" className="btn-primary">
              View my orders
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {returns.map((r) => (
            <ReturnRow
              key={r.id}
              r={r}
              highlight={highlightId && String(r.id) === String(highlightId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}