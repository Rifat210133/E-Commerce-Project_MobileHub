import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ordersApi } from "../api";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/Icon";
import { fmt } from "../lib/format";

export default function OrdersPage() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    ordersApi.listOrders().then((d) => setOrders(d.results || d || []));
  }, []);

  if (orders === null) return <Spinner />;
  if (!orders.length) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon="receipt_long"
          title="No orders yet"
          message="When you place your first order, it'll show up here."
          action={<Link to="/catalog" className="btn-primary">Start shopping</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <div className="eyebrow text-primary mb-1">Orders</div>
        <h1 className="text-headline-lg text-ink">My orders</h1>
      </div>
      <div className="space-y-3">
        {orders.map((o) => (
          <Link key={o.order_number} to={`/orders/${o.order_number}`} className="card card-hover p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-50 text-primary flex items-center justify-center">
              <Icon name="package_2" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-title-md text-ink">#{o.order_number}</div>
              <div className="text-label-md text-ink-muted">{fmt.dateLong(o.created_at)} · {o.item_count} items</div>
            </div>
            <div className="text-right">
              <StatusBadge status={o.status} />
              <div className="text-title-md text-primary mt-1">{fmt.money(o.total_amount ?? o.total)}</div>
            </div>
            <Icon name="chevron_right" className="text-ink-subtle" />
          </Link>
        ))}
      </div>
    </div>
  );
}