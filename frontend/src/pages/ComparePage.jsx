import { Link } from "react-router-dom";
import { useEffect } from "react";
import { useCompareStore } from "../stores/compareStore";
import { useUIStore } from "../stores/uiStore";
import Icon from "../components/Icon";
import EmptyState from "../components/EmptyState";
import Spinner from "../components/Spinner";
import { fmt } from "../lib/format";

const SPEC_ROWS = [
  { key: "price", label: "Price", kind: "money" },
  { key: "rating", label: "Rating", kind: "rating" },
  { key: "ram", label: "RAM", suffix: " GB" },
  { key: "storage", label: "Storage", suffix: " GB" },
  { key: "display", label: "Display", suffix: '"' },
  { key: "refresh", label: "Refresh rate", suffix: " Hz" },
  { key: "processor", label: "Chipset" },
  { key: "battery", label: "Battery", suffix: " mAh" },
  { key: "charging", label: "Charging", suffix: " W" },
  { key: "camera", label: "Main camera", suffix: " MP" },
  { key: "front", label: "Front camera", suffix: " MP" },
  { key: "has_5g", label: "5G", kind: "yesno" },
  { key: "os", label: "OS" },
];

function pickValue(p, key) {
  const s = p.spec || {};
  switch (key) {
    case "price": return p.price;
    case "rating": return { value: Number(p.rating_avg || 0), count: p.review_count || 0 };
    case "ram": return s.ram_gb;
    case "storage": return s.storage_gb;
    case "display": return s.display_inches;
    case "refresh": return s.refresh_rate_hz;
    case "processor": return s.processor;
    case "battery": return s.battery_mah;
    case "charging": return s.charging_watts;
    case "camera": return s.camera_mp;
    case "front": return s.front_camera_mp;
    case "has_5g": return s.has_5g;
    case "os": return s.os;
    default: return null;
  }
}

function renderValue(row, v) {
  if (v == null || v === "") return <span className="text-ink-subtle">—</span>;
  if (row.kind === "money") return <span className="text-primary font-semibold">{fmt.money(v)}</span>;
  if (row.kind === "rating") {
    return (
      <span className="inline-flex items-center gap-1">
        <Icon name="star" size={16} className="text-accent-gold" filled />
        <span className="text-ink">{v.value.toFixed(1)}</span>
        <span className="text-ink-subtle text-label-sm">({v.count})</span>
      </span>
    );
  }
  if (row.kind === "yesno") return v ? <Icon name="check_circle" size={18} className="text-accent-success" /> : <Icon name="remove_circle" size={18} className="text-ink-subtle" />;
  return (
    <span className="text-ink">
      {v}
      {row.suffix || ""}
    </span>
  );
}

export default function ComparePage() {
  const items = useCompareStore((s) => s.items);
  const isLoading = useCompareStore((s) => s.isLoading);
  const fetchCompare = useCompareStore((s) => s.fetch);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);
  const notify = useUIStore((s) => s.notify);

  useEffect(() => { fetchCompare(); }, [fetchCompare]);

  const onRemove = async (id) => {
    try { await remove(id); notify("Removed from compare"); }
    catch { notify("Could not remove", "error"); }
  };
  const onClear = async () => {
    try { await clear(); notify("Compare list cleared"); }
    catch { notify("Could not clear", "error"); }
  };

  return (
    <div className="container-page py-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="eyebrow text-primary mb-1">Compare</div>
          <h1 className="text-headline-lg text-ink">Side-by-side specs</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Up to 4 phones, lined up spec-by-spec.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/catalog" className="btn-ghost">
            <Icon name="add" size={18} /> Add more
          </Link>
          {items.length > 0 && (
            <button onClick={onClear} className="btn-ghost text-accent-danger">
              <Icon name="delete_sweep" size={18} /> Clear
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="card p-12"><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="compare_arrows"
          title="Nothing to compare yet"
          message="Tick 'Add to Compare' on any product card to start building your comparison list."
          action={<Link to="/catalog" className="btn-primary">Browse catalog</Link>}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white p-4 w-48 align-bottom">
                  <div className="text-label-md text-ink-subtle uppercase">Specification</div>
                </th>
                {items.map((p) => (
                  <th key={p.id} className="p-4 align-top min-w-[200px]">
                    <div className="flex flex-col gap-2">
                      <div className="relative w-full h-32 rounded-sm bg-surface-alt overflow-hidden">
                        <img
                          src={p.images?.[0] || p.image || "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80"}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => onRemove(p.id)}
                          className="absolute top-1 right-1 w-7 h-7 rounded-full bg-white border border-surface-border text-ink-muted hover:text-accent-danger flex items-center justify-center"
                          aria-label="Remove from compare"
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                      <div className="text-label-sm text-ink-subtle uppercase">{p.brand_name}</div>
                      <Link to={`/product/${p.slug}`} className="text-title-md text-ink hover:text-primary line-clamp-2">
                        {p.name}
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SPEC_ROWS.map((row, i) => (
                <tr key={row.key} className={i % 2 === 0 ? "bg-surface-alt/40" : "bg-white"}>
                  <td className="sticky left-0 z-10 bg-inherit p-3 text-label-md text-ink-muted">
                    {row.label}
                  </td>
                  {items.map((p) => (
                    <td key={p.id} className="p-3 text-body-md">
                      {renderValue(row, pickValue(p, row.key))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}