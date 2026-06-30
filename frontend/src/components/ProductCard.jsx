import { Link } from "react-router-dom";
import { useState } from "react";
import Icon from "./Icon";
import { fmt } from "../lib/format";
import { useCompareStore } from "../stores/compareStore";
import { useUIStore } from "../stores/uiStore";

function ScoreBadge({ score, activeCount = 0 }) {
  // Same dynamic scaling as RecommendationsPage: displayed % rises with filter
  // specificity (more filters → tighter denominator → higher %).
  // 1 filter → /1.35, 2 → /1.30, 3 → /1.25, 4 → /1.20, 5+ → /1.15
  const denom = Math.max(1.15, 1.4 - 0.05 * activeCount);
  const pct = Math.max(0, Math.min(100, Math.round((Number(score) || 0) / denom)));
  return (
    <div
      className="absolute top-2 right-2 w-12 h-12 rounded-full bg-white/95 backdrop-blur-sm border-2 border-primary flex flex-col items-center justify-center shadow-sm"
      title={`Match score ${score}`}
    >
      <div className="text-title-sm font-bold text-primary leading-none">{pct}%</div>
      <div className="text-[9px] text-ink-subtle uppercase tracking-wider mt-0.5">match</div>
    </div>
  );
}

export default function ProductCard({ product, layout = "grid", compact = false, matchScore = null, activeCount = 0 }) {
  if (!product) return null;
  const image =
    product.images?.[0] ||
    product.image ||
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80";
  const rating = Number(product.rating_avg || 0).toFixed(1);
  const discount =
    product.original_price && product.original_price > product.price
      ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
      : 0;

  // Compare checkbox state (not used in horizontal layout)
  const inCompare = useCompareStore((s) => s.ids.has(product.id));
  const compareCount = useCompareStore((s) => s.count);
  const toggleCompare = useCompareStore((s) => s.toggle);
  const notify = useUIStore((s) => s.notify);
  const [busy, setBusy] = useState(false);

  const onToggleCompare = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const { added } = await toggleCompare(product.id);
      notify(added ? `Added to compare (${compareCount + 1})` : "Removed from compare", "success");
    } catch (err) {
      notify(err?.message || "Could not update compare", "error");
    } finally {
      setBusy(false);
    }
  };

  if (layout === "horizontal") {
    return (
      <Link
        to={`/product/${product.slug}`}
        className="card card-hover flex gap-4 p-4"
      >
        <div className="w-28 h-28 shrink-0 rounded-sm bg-surface-alt overflow-hidden">
          <img src={image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-label-sm text-ink-subtle uppercase">{product.brand?.name || product.brand_name}</div>
          <div className="text-title-md text-ink truncate">{product.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <Icon name="star" size={16} className="text-accent-gold" filled />
            <span className="text-label-md text-ink-muted">{rating}</span>
            <span className="text-label-sm text-ink-subtle">({product.review_count || 0})</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-title-lg text-primary">{fmt.money(product.price)}</span>
            {discount > 0 && (
              <span className="text-label-md text-ink-subtle line-through">{fmt.money(product.original_price)}</span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // Compact card for the catalog grid (matches the reference design)
  if (compact) {
    return (
      <div className="card card-hover overflow-hidden flex flex-col">
        <Link to={`/product/${product.slug}`} className="block">
          <div className="relative h-32 bg-surface-alt overflow-hidden">
            <img src={image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
            {discount > 0 && (
              <span className="absolute top-2 left-2 badge bg-accent-danger text-white text-label-sm">
                -{discount}%
              </span>
            )}
            {matchScore != null && <ScoreBadge score={matchScore} activeCount={activeCount} />}
          </div>
        </Link>
        <div className="p-3 flex flex-col gap-1 flex-1">
          <div className="text-label-sm text-ink-subtle uppercase tracking-wider truncate">
            {product.brand_name || product.brand?.name}
          </div>
          <Link to={`/product/${product.slug}`} className="text-title-md text-ink line-clamp-1 hover:text-primary">
            {product.name}
          </Link>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-title-md text-primary font-semibold">{fmt.money(product.price)}</span>
            {discount > 0 && (
              <span className="text-label-sm text-ink-subtle line-through">{fmt.money(product.original_price)}</span>
            )}
          </div>
          <label
            className="flex items-center gap-2 mt-2 pt-2 border-t border-surface-border cursor-pointer select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={inCompare}
              onChange={onToggleCompare}
              disabled={busy}
              className="w-4 h-4 rounded border-surface-border text-primary accent-primary"
            />
            <span className="text-label-sm text-ink-muted">Add to Compare</span>
          </label>
        </div>
      </div>
    );
  }

  // Default full-size card
  return (
    <Link to={`/product/${product.slug}`} className="card card-hover overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-surface-alt overflow-hidden">
        <img src={image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        {discount > 0 && (
          <span className="absolute top-3 left-3 badge bg-accent-danger text-white">
            -{discount}%
          </span>
        )}
        {product.label && (
          <span className="absolute top-3 right-3 badge bg-primary text-white">
            {product.label}
          </span>
        )}
        {matchScore != null && (
          <div className="absolute bottom-3 right-3">
            <ScoreBadge score={matchScore} activeCount={activeCount} />
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-1.5">
        <div className="text-label-sm text-ink-subtle uppercase tracking-wider">
          {product.brand?.name || product.brand_name}
        </div>
        <div className="text-title-md text-ink line-clamp-1">{product.name}</div>
        <div className="flex items-center gap-1.5 text-label-md text-ink-muted">
          <Icon name="star" size={16} className="text-accent-gold" filled />
          <span>{rating}</span>
          <span className="text-ink-subtle">({product.review_count || 0})</span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-title-lg text-primary">{fmt.money(product.price)}</span>
          {discount > 0 && (
            <span className="text-label-md text-ink-subtle line-through">
              {fmt.money(product.original_price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}