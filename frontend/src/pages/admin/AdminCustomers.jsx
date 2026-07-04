import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import { fmt } from "../../lib/format";
import Spinner from "../../components/Spinner";
import EmptyState from "../../components/EmptyState";
import Icon from "../../components/Icon";

// Membership tier → chip color + Material Symbol. The backend ships the
// tier lower-cased (gold / platinum / standard / elite), and the live
// value comes from `Profile.computed_tier` (paid lifetime spend bucket).
// Colors stay on-brand: brand-primary for Platinum (premium anchor),
// accent-gold for Gold, accent-info for Elite (legacy), neutral for
// Standard. An icon is included so the pill reads at a glance, not just
// by hue (helps in dark mode / color-blind contexts).
const TIER_BADGE = {
  standard: { chip: "chip-neutral", icon: "person" },
  gold: { chip: "chip-warning", icon: "workspace_premium" },
  platinum: { chip: "chip-primary", icon: "diamond" },
  elite: { chip: "chip-info", icon: "shield" },
};

const tierBadge = (t) => TIER_BADGE[(t || "standard").toLowerCase()] || TIER_BADGE.standard;

export default function AdminCustomers() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    adminApi.adminCustomers().then((d) => setData(d.results || d || []));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    if (!q) return data;
    const s = q.toLowerCase();
    return data.filter((c) =>
      [c.username, c.email, c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase().includes(s)
    );
  }, [data, q]);

  if (data === null) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow text-primary mb-1">People</div>
          <h1 className="text-headline-md text-ink">Customers</h1>
        </div>
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={18} />
          <input className="input pl-10 !py-2 w-72" placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!rows.length ? (
        <EmptyState icon="group" title="No customers found" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-md">
              <thead className="bg-surface-alt text-label-md text-ink-muted uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Joined</th>
                  <th className="text-right px-4 py-3">Orders</th>
                  <th className="text-right px-4 py-3">Lifetime value</th>
                  <th className="text-right px-4 py-3">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-alt/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary flex items-center justify-center font-semibold">
                          {(c.first_name?.[0] || c.username?.[0] || "U").toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-ink">{c.first_name || c.last_name ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : c.username}</div>
                          <div className="text-label-sm text-ink-muted">@{c.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{c.email}</td>
                    <td className="px-4 py-3 text-ink-muted">{fmt.date(c.date_joined)}</td>
                    <td className="px-4 py-3 text-right text-ink">{fmt.compact(c.order_count ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{fmt.money(c.lifetime_value ?? 0)}</td>
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const tier = tierBadge(c.membership_tier);
                        return (
                          <span className={`chip ${tier.chip} capitalize`}>
                            <Icon name={tier.icon} size={14} />
                            {c.membership_tier || "standard"}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}