import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../api";
import { fmt } from "../../lib/format";
import Spinner from "../../components/Spinner";
import Icon from "../../components/Icon";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, PieChart, Pie, Legend } from "recharts";

const COLORS = ["#00236F", "#F5A623", "#16A34A", "#DC2626", "#7C3AED", "#0EA5E9"];

const TONE_TO_CLASS = {
  primary: "bg-primary-50 text-primary",
  info: "bg-accent-info/10 text-accent-info",
  success: "bg-accent-success/10 text-accent-success",
  gold: "bg-accent-gold/10 text-accent-gold",
};

// Backend `/api/admin/analytics/overview/` returns
// { total_revenue, revenue_change_pct, total_orders, orders_change_pct,
//   active_users, users_change_pct, inventory_alerts }.
// Older shapes used { revenue, orders, customers, avg_order_value, *_delta }.
// Map both into the tile-friendly shape AnalyticsOverview expects.
function normalizeOverview(raw) {
  if (!raw || typeof raw !== "object") return null;
  const revenue = raw.total_revenue ?? raw.revenue ?? 0;
  const orders = raw.total_orders ?? raw.orders ?? 0;
  const customers = raw.active_users ?? raw.customers ?? 0;
  const avgOrder = orders > 0 ? revenue / orders : raw.avg_order_value ?? 0;
  return {
    revenue,
    orders,
    customers,
    avg_order_value: avgOrder,
    revenue_delta: raw.revenue_change_pct ?? raw.revenue_delta ?? null,
    orders_delta: raw.orders_change_pct ?? raw.orders_delta ?? null,
    customers_delta: raw.users_change_pct ?? raw.customers_delta ?? null,
    aov_delta: raw.aov_change_pct ?? raw.aov_delta ?? null,
    inventory_alerts: raw.inventory_alerts ?? 0,
  };
}

// Backend `/api/admin/analytics/sales/` returns `{ range, series: [{date,revenue,orders}] }`
// for both 30d and custom ranges. Flatten it so recharts can consume the array directly.
// We normalize every entry to `{ date, total: revenue, orders: count }` so recharts can
// plot revenue with `dataKey="total"` regardless of the backend's field name.
function normalizeSeries(raw) {
  const list = Array.isArray(raw)
    ? raw
    : raw && Array.isArray(raw.series)
      ? raw.series
      : raw && Array.isArray(raw.points)
        ? raw.points
        : raw && Array.isArray(raw.data)
          ? raw.data
          : [];
  return list.map((p) => {
    const date = p.date || p.day || p.bucket || "";
    const revenue = Number(p.revenue ?? p.total ?? p.sales ?? p.amount ?? 0) || 0;
    const orders = Number(p.orders ?? p.count ?? p.order_count ?? 0) || 0;
    return { date, total: revenue, revenue, orders };
  });
}

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

export default function AnalyticsOverview() {
  const [overview, setOverview] = useState(null);
  const [series, setSeries] = useState([]);
  const [dist, setDist] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // Fire all four in parallel; tolerate partial failures so one broken
    // endpoint doesn't blank the whole dashboard ("missing admin dashboard").
    Promise.allSettled([
      adminApi.analyticsOverview().then(normalizeOverview).then(setOverview),
      adminApi.salesSeries("30d").then(normalizeSeries).then(setSeries),
      adminApi.distribution("brand").then(normalizeList).then(setDist),
      adminApi.inventoryAlerts().then(normalizeList).then(setLowStock),
    ]).then((results) => {
      if (cancelled) return;
      const failed = results.find((r) => r.status === "rejected");
      if (failed) setError(failed.reason?.message || "Some analytics failed to load");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!overview) return <Spinner />;

  const tiles = [
    { label: "Total revenue", value: fmt.money(overview.revenue), icon: "payments", delta: overview.revenue_delta, tone: "primary" },
    { label: "Orders", value: fmt.compact(overview.orders), icon: "receipt_long", delta: overview.orders_delta, tone: "info" },
    { label: "Active customers", value: fmt.compact(overview.customers), icon: "group", delta: overview.customers_delta, tone: "success" },
    { label: "Avg. order", value: fmt.money(overview.avg_order_value), icon: "shopping_bag", delta: overview.aov_delta, tone: "gold" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow text-primary mb-1">Last 30 days</div>
          <h1 className="text-headline-md text-ink">Analytics overview</h1>
        </div>
        <Link to="/admin/orders" className="btn-outline">View all orders <Icon name="arrow_forward" size={16} /></Link>
      </div>

      {error && (
        <div className="card p-4 border-l-4 border-accent-warning bg-accent-warning/5 text-label-md text-ink">
          <span className="font-semibold mr-2">Partial data:</span>
          {error}. Some charts may be empty.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-5">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-md ${TONE_TO_CLASS[t.tone]} flex items-center justify-center`}>
                <Icon name={t.icon} size={20} />
              </div>
              {typeof t.delta === "number" && (
                <span className={`text-label-md font-medium ${t.delta >= 0 ? "text-accent-success" : "text-accent-danger"}`}>
                  {t.delta >= 0 ? "▲" : "▼"} {fmt.percent(Math.abs(t.delta))}
                </span>
              )}
            </div>
            <div className="mt-4 text-display-md text-ink">{t.value}</div>
            <div className="text-label-md text-ink-muted mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-title-md text-ink">Sales trend</h2>
            <div className="text-label-md text-ink-muted">30 days</div>
          </div>
          <div className="h-72">
            {series.length === 0 ? (
              <div className="h-full flex items-center justify-center text-label-md text-ink-muted">No sales in the last 30 days.</div>
            ) : (
              <ResponsiveContainer>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EE" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#7A8194" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#7A8194" tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #E6E8EE" }}
                    formatter={(value, name) => {
                      if (name === "total" || name === "revenue") return [fmt.money(value), "Revenue"];
                      return [value, name];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Revenue"
                    stroke="#00236F"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#00236F", stroke: "#fff", strokeWidth: 1 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-title-md text-ink">By category</h2>
            <div className="text-label-md text-ink-muted">Share</div>
          </div>
          <div className="h-72">
            {dist.length === 0 ? (
              <div className="h-full flex items-center justify-center text-label-md text-ink-muted">No category data yet.</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={dist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {dist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-title-md text-ink">Low stock alerts</h2>
            <Link to="/admin/inventory" className="text-label-md text-primary">Manage inventory</Link>
          </div>
          <ul className="divide-y divide-surface-border">
            {lowStock.slice(0, 5).map((p) => (
              <li key={p.id} className="py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-surface-alt overflow-hidden flex items-center justify-center">
                  {p.image ? <img src={p.image} className="w-full h-full object-cover" alt="" /> : <Icon name="smartphone" className="text-ink-subtle" size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-title-md text-ink line-clamp-1">{p.name}</div>
                  <div className="text-label-md text-ink-muted">{p.brand?.name || p.brand}</div>
                </div>
                <div className={`chip ${p.stock <= 5 ? "chip-danger" : "chip-warning"}`}>{p.stock} left</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}