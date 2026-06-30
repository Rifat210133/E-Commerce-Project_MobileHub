import { useEffect, useState } from "react";
import { adminApi } from "../../api";
import { fmt, inventoryLevel } from "../../lib/format";
import Spinner from "../../components/Spinner";
import EmptyState from "../../components/EmptyState";
import Icon from "../../components/Icon";
import { useUIStore } from "../../stores/uiStore";

export default function AdminInventory() {
  const [items, setItems] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const notify = useUIStore((s) => s.notify);

  const load = () => adminApi.adminInventoryList().then((d) => {
    const rows = d.results || d || [];
    setItems(rows);
    setDrafts(Object.fromEntries(rows.map((r) => [r.id, r.stock])));
  });

  useEffect(() => { load(); }, []);

  const save = async (id) => {
    setSavingId(id);
    try {
      await adminApi.updateStock(id, Number(drafts[id]));
      notify("Stock updated", "success");
      load();
    } finally {
      setSavingId(null);
    }
  };

  if (items === null) return <Spinner />;

  const critical = items.filter((i) => i.stock <= 5).length;
  const low = items.filter((i) => i.stock > 5 && i.stock <= 15).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow text-primary mb-1">Stock</div>
          <h1 className="text-headline-md text-ink">Inventory</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip chip-danger">{critical} critical</span>
          <span className="chip chip-warning">{low} low</span>
        </div>
      </div>

      {!items.length ? (
        <EmptyState icon="inventory_2" title="No inventory data" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-md">
              <thead className="bg-surface-alt text-label-md text-ink-muted uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3">Brand</th>
                  <th className="text-right px-4 py-3">Current stock</th>
                  <th className="text-left px-4 py-3">Level</th>
                  <th className="text-right px-4 py-3">Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {items.map((p) => {
                  const lvl = inventoryLevel(p.stock);
                  return (
                    <tr key={p.id} className="hover:bg-surface-alt/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-md bg-surface-alt overflow-hidden flex items-center justify-center">
                            {p.image ? <img src={p.image} className="w-full h-full object-cover" alt="" /> : <Icon name="smartphone" className="text-ink-subtle" size={18} />}
                          </div>
                          <div className="font-medium text-ink line-clamp-1">{p.name}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{p.brand?.name}</td>
                      <td className="px-4 py-3 text-right font-medium text-ink">{fmt.compact(p.stock)}</td>
                      <td className="px-4 py-3">
                        <span className={`chip ${lvl.variant === "danger" ? "chip-danger" : lvl.variant === "warning" ? "chip-warning" : "chip-success"}`}>{lvl.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            className="input !py-1.5 w-24 text-right"
                            value={drafts[p.id] ?? p.stock}
                            onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                          />
                          <button
                            onClick={() => save(p.id)}
                            disabled={savingId === p.id || Number(drafts[p.id]) === p.stock}
                            className="btn-primary !py-1.5 !px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingId === p.id ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}