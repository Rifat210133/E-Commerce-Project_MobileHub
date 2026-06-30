import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ordersApi, recsApi } from "../api";
import Spinner from "../components/Spinner";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/Icon";
import { fmt } from "../lib/format";

const TIMELINE = ["pending", "confirmed", "processing", "shipped", "delivered"];

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

export default function OrderDetailPage() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [video, setVideo] = useState(null);

  useEffect(() => {
    ordersApi.getOrder(orderNumber).then(setOrder);
  }, [orderNumber]);

  useEffect(() => {
    if (order?.items?.[0]?.product_slug) {
        recsApi.youtube(order.items[0].product_slug).then((d) => {
          if (d?.videos?.[0]) setVideo(d.videos[0]);
        }).catch(() => {});
      }
  }, [order]);

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
            <div className="flex items-center gap-2 text-body-md text-ink-muted">
              <Icon name={(addr.payment_method || order.payment_method) === "cod" ? "payments" : "credit_card"} />
              <span className="capitalize">{(addr.payment_method || order.payment_method || "card").replace(/_/g, " ")}</span>
            </div>
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
        </div>
      </div>
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