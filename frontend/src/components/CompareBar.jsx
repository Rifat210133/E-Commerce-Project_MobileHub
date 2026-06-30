import { Link, useNavigate } from "react-router-dom";
import { useCompareStore } from "../stores/compareStore";
import { useUIStore } from "../stores/uiStore";
import Icon from "./Icon";

export default function CompareBar() {
  const items = useCompareStore((s) => s.items);
  const count = useCompareStore((s) => s.count);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);
  const notify = useUIStore((s) => s.notify);
  const navigate = useNavigate();

  if (!count) return null;

  const onRemove = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await remove(id);
    } catch (err) {
      notify("Could not remove", "error");
    }
  };

  const onClear = async () => {
    try {
      await clear();
      notify("Compare list cleared");
    } catch (err) {
      notify("Could not clear", "error");
    }
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-surface-border shadow-elevated">
      <div className="container-page py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center">
            <Icon name="compare_arrows" size={20} />
          </div>
          <div className="leading-tight">
            <div className="text-title-md text-ink">Compare ({count})</div>
            <div className="text-label-sm text-ink-subtle">Side-by-side specs</div>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2 overflow-x-auto hide-scrollbar">
          {items.map((p) => (
            <div
              key={p.id}
              className="relative shrink-0 w-16 h-16 rounded-sm bg-surface-alt overflow-hidden border border-surface-border group"
              title={p.name}
            >
              <img
                src={p.images?.[0] || p.image || "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=120&q=60"}
                alt={p.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={(e) => onRemove(p.id, e)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-surface-border text-ink-muted hover:text-accent-danger flex items-center justify-center shadow-sticky"
                aria-label="Remove from compare"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onClear} className="btn-ghost text-label-md">
            Clear
          </button>
          <button
            disabled={count < 2}
            onClick={() => navigate("/compare")}
            className={count < 2 ? "btn-secondary opacity-50 cursor-not-allowed" : "btn-primary"}
            title={count < 2 ? "Add at least 2 products" : "Compare now"}
          >
            <Icon name="compare_arrows" size={18} />
            <span>Compare now</span>
          </button>
        </div>
      </div>
    </div>
  );
}