import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { recsApi } from "../api";
import ProductCard from "../components/ProductCard";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import FilterVideoCard from "../components/FilterVideoCard";
import { fmt } from "../lib/format";
import { useRecFiltersStore } from "../stores/recFiltersStore";

const BUDGET_PRESETS = [
  { label: "Any budget", value: null },
  { label: "Under 30,000TK", value: 30000 },
  { label: "Under 50,000TK", value: 50000 },
  { label: "Under 80,000TK", value: 80000 },
  { label: "Under 1,20,000TK", value: 120000 },
];

const USE_CASES = [
  { value: "gaming", label: "Gaming", icon: "sports_esports", desc: "High refresh + flagship SoC" },
  { value: "camera", label: "Camera", icon: "photo_camera", desc: "Flagship imaging" },
  { value: "value", label: "Best value", icon: "savings", desc: "Picked for price-to-spec" },
  { value: "trending", label: "Trending", icon: "trending_up", desc: "Popular right now" },
  { value: "budget", label: "Budget", icon: "attach_money", desc: "Friendly on the wallet" },
];

const RAM_OPTIONS = [
  { value: null, label: "Any" },
  { value: 6, label: "6 GB+" },
  { value: 8, label: "8 GB+" },
  { value: 12, label: "12 GB+" },
  { value: 16, label: "16 GB+" },
];

const BATTERY_OPTIONS = [
  { value: null, label: "Any" },
  { value: 4000, label: "4,000 mAh+" },
  { value: 5000, label: "5,000 mAh+" },
  { value: 5500, label: "5,500 mAh+" },
];

function buildParams(state) {
  const params = {};
  if (state.budget) params.budget = state.budget;
  if (state.useCase) params.use_case = state.useCase;
  if (state.brands?.length) params.brands = state.brands.join(",");
  if (state.processor?.trim()) params.processor = state.processor.trim();
  if (state.chipset?.trim()) params.chipset = state.chipset.trim();
  if (state.ramMin) params.ram_min = state.ramMin;
  if (state.batteryMin) params.battery_min = state.batteryMin;
  if (state.has5g) params.has_5g = "true";
  if (state.inStock) params.in_stock = "true";
  params.limit = 24;
  return params;
}

// Translate the For You filter shape into the param keys the YouTube
// endpoint understands. Returns null when no filters are active so we
// don't burn quota on the unfiltered landing view.
function paramsToYoutubeParams(state) {
  const params = {};
  // Brand — endpoint accepts a single value; pick the first selected brand.
  if (state.brands?.length) params.brand = state.brands[0];
  if (state.useCase) params.use_case = state.useCase;
  if (state.budget) params.price_max = state.budget;
  if (state.ramMin) params.ram_min = state.ramMin;
  if (state.batteryMin) params.battery_min = state.batteryMin;
  if (state.has5g) params.has_5g = "true";
  return params;
}

// Hook: returns a debounced value (delays updates by `delay` ms)
function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ReasonChip({ children }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-50 text-primary text-label-sm">
      <Icon name="auto_awesome" size={14} className="text-accent-gold" filled />
      {children}
    </span>
  );
}

function ScoreBadge({ score, activeCount = 0 }) {
  // Denominator shrinks as more filters are applied so the displayed %
  // rises with filter specificity and falls when filters are loosened.
  // 1 filter → /1.35, 2 → /1.30, 3 → /1.25, 4 → /1.20, 5+ → /1.15
  const denom = Math.max(1.15, 1.4 - 0.05 * activeCount);
  const pct = Math.max(0, Math.min(100, Math.round((Number(score) || 0) / denom)));
  return (
    <div
      className="absolute top-3 right-3 w-14 h-14 rounded-full bg-white/95 backdrop-blur-sm border-2 border-primary flex flex-col items-center justify-center shadow-sm"
      title={`Match score ${score}`}
    >
      <div className="text-title-md font-bold text-primary leading-none">{pct}%</div>
      <div className="text-[10px] text-ink-subtle uppercase tracking-wider mt-0.5">match</div>
    </div>
  );
}

function ResultCard({ product, activeCount }) {
  const image =
    product.images?.[0] ||
    product.image ||
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80";
  return (
    <div className="card card-hover overflow-hidden flex flex-col">
      <Link to={`/product/${product.slug}`} className="relative block">
        <div className="aspect-square bg-surface-alt overflow-hidden">
          <img src={image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
        <ScoreBadge score={product.match_score} activeCount={activeCount} />
      </Link>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="text-label-sm text-ink-subtle uppercase tracking-wider truncate">
          {product.brand_name}
        </div>
        <Link to={`/product/${product.slug}`} className="text-title-md text-ink line-clamp-1 hover:text-primary">
          {product.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {product.chipset && (
            <span className="text-label-sm text-ink-muted inline-flex items-center gap-1">
              <Icon name="memory" size={14} /> {product.chipset}
            </span>
          )}
          {product.ram_gb ? (
            <span className="text-label-sm text-ink-muted">{product.ram_gb} GB</span>
          ) : null}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-title-lg text-primary font-semibold">{fmt.money(product.price)}</span>
          {Number(product.expert_rating) > 0 && (
            <span className="text-label-sm text-ink-muted inline-flex items-center gap-1">
              <Icon name="star" size={14} className="text-accent-gold" filled />
              {Number(product.expert_rating).toFixed(1)}
            </span>
          )}
        </div>
        {product.reasons?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-surface-border">
            {product.reasons.slice(0, 3).map((r) => (
              <ReasonChip key={r}>{r}</ReasonChip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  const [facets, setFacets] = useState({ brands: [], chipsets: [] });
  const [filters, setFilters] = useState({
    budget: null,
    useCase: null,
    brands: [],
    processor: "",
    chipset: "",
    ramMin: null,
    batteryMin: null,
    has5g: false,
    inStock: false,
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [criteria, setCriteria] = useState(null);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const setActiveCount = useRecFiltersStore((s) => s.setActiveCount);
  const resetFilters = useRecFiltersStore((s) => s.reset);

  // Load facets once
  useEffect(() => {
    recsApi.facets().then((f) => setFacets(f || { brands: [], chipsets: [] })).catch(() => {});
  }, []);

  // Build stable params, debounce fetch so rapid filter clicks don't spam the API.
  // We use `params` as a memoized string so the effect only fires when the actual
  // serialized query string changes — toggling brand or budget = new key = new fetch.
  const rawParams = useMemo(() => buildParams(filters), [filters]);
  const paramsKey = useDebounced(
    useMemo(() => JSON.stringify(rawParams), [rawParams]),
    200
  );
  const params = useMemo(() => JSON.parse(paramsKey), [paramsKey]);

  const [retryToken, setRetryToken] = useState(0);
  const triggerRetry = () => setRetryToken((n) => n + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    recsApi
      .suggest(params)
      .then((data) => {
        if (!alive) return;
        setResults(data.results || []);
        setCriteria(data.criteria || null);
        setTotalCandidates(data.total_candidates || 0);
      })
      .catch((err) => {
        if (!alive) return;
        console.error("[Recommendations] fetch failed:", err?.message || err);
        setError(
          err?.response?.data?.detail ||
            err?.message ||
            "Couldn't load recommendations. Please try again."
        );
        setResults([]);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [paramsKey, retryToken]);

  const toggleBrand = (slug) =>
    setFilters((s) => ({
      ...s,
      brands: s.brands.includes(slug)
        ? s.brands.filter((x) => x !== slug)
        : [...s.brands, slug],
    }));

  const setBudget = (value) => setFilters((s) => ({ ...s, budget: value }));
  const setUseCase = (value) =>
    setFilters((s) => ({ ...s, useCase: s.useCase === value ? null : value }));
  const setRam = (value) => setFilters((s) => ({ ...s, ramMin: value }));
  const setBattery = (value) => setFilters((s) => ({ ...s, batteryMin: value }));

  const clearAll = () =>
    setFilters({
      budget: null,
      useCase: null,
      brands: [],
      processor: "",
      chipset: "",
      ramMin: null,
      batteryMin: null,
      has5g: false,
      inStock: false,
    });

  const activeCount =
    (filters.budget ? 1 : 0) +
    (filters.useCase ? 1 : 0) +
    filters.brands.length +
    (filters.processor ? 1 : 0) +
    (filters.chipset ? 1 : 0) +
    (filters.ramMin ? 1 : 0) +
    (filters.batteryMin ? 1 : 0) +
    (filters.has5g ? 1 : 0) +
    (filters.inStock ? 1 : 0);

  // Pull YouTube suggestions that match the For You filter set. Re-runs
  // whenever filters change; skipped entirely when no filters are active.
  const [videos, setVideos] = useState([]);
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  useEffect(() => {
    if (!activeCount) {
      setVideos([]);
      setActiveVideoId(null);
      return;
    }
    let alive = true;
    setVideoLoading(true);
    recsApi
      .youtube(paramsToYoutubeParams(filters))
      .then((d) => {
        if (!alive) return;
        const list = d?.results || [];
        setVideos(list);
        setActiveVideoId(list[0]?.videoId || null);
      })
      .catch(() => {
        if (!alive) return;
        setVideos([]);
        setActiveVideoId(null);
      })
      .finally(() => alive && setVideoLoading(false));
    return () => { alive = false; };
  }, [filters, activeCount]);

  // Publish active filter count so Navbar can show/hide "For You"
  useEffect(() => {
    setActiveCount(activeCount);
  }, [activeCount, setActiveCount]);

  // Reset on unmount so leaving the page hides the nav link
  useEffect(() => {
    return () => resetFilters();
  }, [resetFilters]);

  return (
    <div className="container-page py-10">
      {/* Hero */}
      <section className="mb-8">
        <div className="eyebrow text-primary mb-2">Personalized picks</div>
        <h1 className="section-title flex items-center gap-2">
          <Icon name="auto_awesome" className="text-accent-gold" filled /> Find your next phone
        </h1>
        <p className="text-body-md text-ink-muted max-w-2xl mt-2">
          Tell us a few things — budget, use case, brand, processor — and we'll rank every phone in the
          catalog by how well it matches.
        </p>
      </section>

      <div className="grid lg:grid-cols-[280px_1fr] gap-8">
        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-title-md">Filters</h3>
              {activeCount > 0 && (
                <button onClick={clearAll} className="text-label-md text-primary hover:underline">
                  Clear all ({activeCount})
                </button>
              )}
            </div>

            {/* Budget */}
            <div className="mb-5">
              <div className="text-label-md uppercase tracking-wider text-ink-subtle mb-2">Budget</div>
              <div className="flex flex-wrap gap-2">
                {BUDGET_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setBudget(p.value)}
                    className={
                      "px-3 py-1.5 rounded-full text-label-md border transition " +
                      (filters.budget === p.value
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-ink border-surface-border hover:border-primary")
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Use case */}
            <div className="mb-5">
              <div className="text-label-md uppercase tracking-wider text-ink-subtle mb-2">Use case</div>
              <div className="grid grid-cols-2 gap-2">
                {USE_CASES.map((u) => (
                  <button
                    key={u.value}
                    onClick={() => setUseCase(u.value)}
                    className={
                      "p-2.5 rounded-md border text-left transition " +
                      (filters.useCase === u.value
                        ? "bg-primary-50 border-primary"
                        : "bg-white border-surface-border hover:border-primary")
                    }
                  >
                    <div className="flex items-center gap-1.5 text-label-md">
                      <Icon name={u.icon} size={16} className="text-primary" />
                      <span className="font-semibold">{u.label}</span>
                    </div>
                    <div className="text-label-sm text-ink-subtle">{u.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Brand */}
            <div className="mb-5">
              <div className="text-label-md uppercase tracking-wider text-ink-subtle mb-2">Brand</div>
              <div className="flex flex-wrap gap-2">
                {facets.brands.map((b) => (
                  <button
                    key={b.slug}
                    onClick={() => toggleBrand(b.slug)}
                    className={
                      "px-3 py-1.5 rounded-full text-label-md border transition " +
                      (filters.brands.includes(b.slug)
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-ink border-surface-border hover:border-primary")
                    }
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Processor */}
            <div className="mb-5">
              <div className="text-label-md uppercase tracking-wider text-ink-subtle mb-2">Processor</div>
              <input
                value={filters.processor}
                onChange={(e) => setFilters((s) => ({ ...s, processor: e.target.value }))}
                placeholder="e.g. Snapdragon, Dimensity, Apple"
                className="input"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {facets.chipsets.slice(0, 8).map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      setFilters((s) => ({ ...s, chipset: s.chipset === c ? "" : c }))
                    }
                    className={
                      "px-2 py-1 rounded text-label-sm border " +
                      (filters.chipset === c
                        ? "bg-primary-50 border-primary text-primary"
                        : "bg-white border-surface-border text-ink-muted hover:border-primary")
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* RAM */}
            <div className="mb-5">
              <div className="text-label-md uppercase tracking-wider text-ink-subtle mb-2">RAM</div>
              <div className="flex flex-wrap gap-1.5">
                {RAM_OPTIONS.map((r) => (
                  <button
                    key={String(r.value)}
                    onClick={() => setRam(r.value)}
                    className={
                      "px-3 py-1.5 rounded-full text-label-md border transition " +
                      (filters.ramMin === r.value
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-ink border-surface-border hover:border-primary")
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Battery */}
            <div className="mb-5">
              <div className="text-label-md uppercase tracking-wider text-ink-subtle mb-2">Battery</div>
              <div className="flex flex-wrap gap-1.5">
                {BATTERY_OPTIONS.map((b) => (
                  <button
                    key={String(b.value)}
                    onClick={() => setBattery(b.value)}
                    className={
                      "px-3 py-1.5 rounded-full text-label-md border transition " +
                      (filters.batteryMin === b.value
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-ink border-surface-border hover:border-primary")
                    }
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick toggles */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.has5g}
                  onChange={(e) => setFilters((s) => ({ ...s, has5g: e.target.checked }))}
                  className="w-4 h-4 rounded border-surface-border text-primary accent-primary"
                />
                <span className="text-body-md">5G required</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.inStock}
                  onChange={(e) => setFilters((s) => ({ ...s, inStock: e.target.checked }))}
                  className="w-4 h-4 rounded border-surface-border text-primary accent-primary"
                />
                <span className="text-body-md">In stock only</span>
              </label>
            </div>
          </div>
        </aside>

        {/* Results */}
        <main>
          {/* Filter-matched YouTube reviews (shown above the results grid) */}
          <FilterVideoCard
            videos={videos}
            activeVideoId={activeVideoId}
            onSelect={setActiveVideoId}
            loading={videoLoading}
            activeCount={activeCount}
          />

          {/* Summary */}
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-title-lg">
                {loading
                  ? "Searching…"
                  : error
                    ? "Error"
                    : `${results.length} match${results.length === 1 ? "" : "es"}`}
                {!loading && !error && totalCandidates > results.length && (
                  <span className="text-ink-subtle text-label-md ml-2">
                    of {totalCandidates}
                  </span>
                )}
              </h2>
              {criteria && (criteria.use_case || criteria.budget || criteria.brands.length > 0) && (
                <div className="text-label-sm text-ink-muted mt-1">
                  {criteria.use_case && <span className="capitalize mr-2">Use case: {criteria.use_case}</span>}
                  {criteria.budget && <span className="mr-2">Budget: ≤ {fmt.money(criteria.budget)}</span>}
                  {criteria.brands.length > 0 && <span>Brands: {criteria.brands.join(", ")}</span>}
                </div>
              )}
              {!loading && activeCount > 0 && (
                <div className="text-label-sm text-primary mt-1">
                  {activeCount} filter{activeCount === 1 ? "" : "s"} applied — match scores are tighter.
                </div>
              )}
            </div>
            <Link to="/catalog" className="link text-label-md flex items-center gap-1">
              Full catalog <Icon name="arrow_forward" size={18} />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <div className="aspect-square bg-surface-alt animate-pulse" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 w-16 bg-surface-alt animate-pulse rounded" />
                    <div className="h-4 w-3/4 bg-surface-alt animate-pulse rounded" />
                    <div className="h-4 w-1/3 bg-surface-alt animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="card p-6 text-center">
              <Icon name="error_outline" size={36} className="text-primary mx-auto" />
              <h3 className="text-title-md mt-3">Couldn't load recommendations</h3>
              <p className="text-label-md text-ink-muted mt-2 max-w-md mx-auto">{error}</p>
              <button
                onClick={() => setFilters((s) => ({ ...s }))}
                className="btn-primary mt-4 inline-flex items-center gap-2"
              >
                <Icon name="refresh" size={18} /> Try again
              </button>
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="No matches yet"
              description="Try widening your budget or removing the processor filter."
              action={
                <button onClick={clearAll} className="btn-primary">
                  Reset filters
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {results.map((p) => (
                <ResultCard key={p.id} product={p} activeCount={activeCount} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}