import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { productsApi, recsApi } from "../api";
import ProductCard from "../components/ProductCard";
import FilterVideoCard from "../components/FilterVideoCard";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import { fmt } from "../lib/format";
import { useRecFiltersStore } from "../stores/recFiltersStore";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
];

// Editor tags (spec-derived)
const TAGS = [
  { key: "is_gaming", label: "Gaming" },
  { key: "is_camera_flagship", label: "Camera flagship" },
  { key: "is_best_value", label: "Best value" },
  { key: "is_trending", label: "Trending" },
  { key: "is_budget_friendly", label: "Budget" },
];

// Capability toggles (most are spec booleans)
const CAPABILITIES = [
  { key: "has_5g", label: "5G", icon: "5g" },
  { key: "has_4g", label: "4G/LTE", icon: "lte_plus" },
  { key: "has_3g", label: "3G", icon: "3g" },
  { key: "has_2g", label: "2G", icon: "2g" },
  { key: "has_nfc", label: "NFC", icon: "contactless" },
  { key: "has_wireless_charging", label: "Wireless charging", icon: "charging" },
  { key: "has_ir", label: "IR blaster", icon: "settings_remote" },
  { key: "is_waterproof", label: "Water resistant", icon: "water_drop" },
  { key: "has_fingerprint", label: "Fingerprint", icon: "fingerprint" },
  { key: "has_face_unlock", label: "Face unlock", icon: "face" },
  { key: "has_audio_jack", label: "3.5 mm jack", icon: "headphones" },
];

// Wire our URL params to the backend's filter names
function paramsToFilters(params) {
  const f = {};
  const txt = (k) => {
    const v = params.get(k);
    return v && v !== "" ? v : null;
  };
  if (txt("q")) f.q = txt("q");
  if (txt("brand")) f.brand = txt("brand");
  if (txt("price_min")) f.price_min = txt("price_min");
  if (txt("price_max")) f.price_max = txt("price_max");
  if (txt("ram")) f.ram = txt("ram");
  if (txt("ram_min")) f.ram_min = txt("ram_min");
  if (txt("storage")) f.storage = txt("storage");
  if (txt("storage_min")) f.storage_min = txt("storage_min");
  if (txt("os")) f.os = txt("os");
  if (txt("processor")) f.processor = txt("processor");
  if (txt("display_min")) f.display_min = txt("display_min");
  if (txt("display_max")) f.display_max = txt("display_max");
  if (txt("refresh_rate_min")) f.refresh_rate_min = txt("refresh_rate_min");
  if (txt("battery_min")) f.battery_min = txt("battery_min");
  if (txt("charging_min")) f.charging_min = txt("charging_min");
  if (txt("camera_min")) f.camera_min = txt("camera_min");
  if (txt("front_camera_min")) f.front_camera_min = txt("front_camera_min");
  if (txt("expert_rating_min")) f.expert_rating_min = txt("expert_rating_min");
  if (txt("rating_avg_min")) f.rating_avg_min = txt("rating_avg_min");
  if (params.get("in_stock") === "true") f.in_stock = "true";
  if (params.get("is_featured") === "true") f.is_featured = "true";
  if (params.get("is_new_arrival") === "true") f.is_new_arrival = "true";
  for (const c of CAPABILITIES) {
    if (params.getAll("cap").includes(c.key)) f[c.key] = "true";
  }
  for (const key of TAGS.map((t) => t.key)) {
    if (params.getAll("tag").includes(key)) f[key] = "true";
  }
  const sort = params.get("sort");
  if (sort) f.sort = sort;
  const page = params.get("page");
  if (page) f.page = page;
  return f;
}

// Translate URL params to the subset supported by /api/recommendations/suggest/
// so we can fetch a match_score for every product the catalog shows.
// Fields the suggest endpoint ignores (os, display, camera, rating, sort, page,
// q text search, exact ram/storage, ram/storage floors with only an exact match,
// price_min, charging_min, etc.) are simply dropped — the products endpoint
// still handles them for filtering; this is score-only.
function paramsToSuggestParams(params) {
  const out = {};
  const txt = (k) => {
    const v = params.get(k);
    return v && v !== "" ? v : null;
  };
  // Budget: combine price_max (preferred) + price_min
  const pmax = txt("price_max");
  const pmin = txt("price_min");
  if (pmax) out.budget = Number(pmax);
  else if (pmin) out.budget = Number(pmin);
  // Brand → suggest expects comma-joined `brands`
  const brand = txt("brand");
  if (brand) out.brands = brand;
  // use_case is a chip toggle on the recs page; not on catalog — skip
  if (txt("processor")) out.processor = txt("processor");
  // Chipset isn't a catalog filter — skip
  // RAM: prefer ram_min, fall back to exact ram
  if (txt("ram_min")) out.ram_min = Number(txt("ram_min"));
  else if (txt("ram")) out.ram_min = Number(txt("ram"));
  // Storage: prefer storage_min, fall back to exact storage
  if (txt("storage_min")) out.storage_min = Number(txt("storage_min"));
  else if (txt("storage")) out.storage_min = Number(txt("storage"));
  if (txt("battery_min")) out.battery_min = Number(txt("battery_min"));
  if (txt("refresh_rate_min")) out.refresh_min = Number(txt("refresh_rate_min"));
  // Capabilities: only has_5g and has_nfc are honored by suggest
  if (params.getAll("cap").includes("has_5g")) out.has_5g = "true";
  if (params.getAll("cap").includes("has_nfc")) out.has_nfc = "true";
  if (params.get("in_stock") === "true") out.in_stock = "true";
  // Cap returned scored set; the catalog result grid can be paginated separately.
  out.limit = 50;
  return out;
}

// Translate catalog URL params into the subset the YouTube endpoint
// understands (`brand`, `use_case`, plus numeric/capability flags the
// backend turns into spec phrases). Only carries keys that are actually
// present so the backend query builder stays accurate.
function paramsToYoutubeParams(params) {
  const out = {};
  const txt = (k) => {
    const v = params.get(k);
    return v && v !== "" ? v : null;
  };
  const brand = txt("brand");
  if (brand) out.brand = brand;

  // Editor tag toggles map to the rec-page "use_case" vocabulary, in the
  // same priority order the backend uses.
  if (params.getAll("tag").includes("is_gaming")) out.use_case = "gaming";
  else if (params.getAll("tag").includes("is_camera_flagship"))
    out.use_case = "camera";
  else if (params.getAll("tag").includes("is_trending"))
    out.use_case = "flagship";
  else if (params.getAll("tag").includes("is_best_value"))
    out.use_case = "mid-range";
  else if (params.getAll("tag").includes("is_budget_friendly"))
    out.use_case = "budget";

  const pmax = txt("price_max");
  const pmin = txt("price_min");
  if (pmax) out.price_max = pmax;
  if (pmin) out.price_min = pmin;

  const ram = txt("ram_min") || txt("ram");
  if (ram) out.ram_min = ram;
  const storage = txt("storage_min") || txt("storage");
  if (storage) out.storage_min = storage;
  const battery = txt("battery_min");
  if (battery) out.battery_min = battery;
  const camera = txt("camera_min");
  if (camera) out.camera_min = camera;
  const refresh = txt("refresh_rate_min");
  if (refresh) out.refresh_rate_min = refresh;

  if (params.getAll("cap").includes("has_5g")) out.has_5g = "true";
  if (params.getAll("cap").includes("has_wireless_charging"))
    out.has_wireless_charging = "true";
  if (params.getAll("cap").includes("is_waterproof")) out.is_waterproof = "true";

  return out;
}

// How many "meaningful" filters are active? Used to drive the dynamic
// match-% scaling and to tell the Navbar whether to show "For You".
// We exclude pagination (`page`) and presentation-only keys (`sort`).
function paramsToActiveCount(params) {
  let n = 0;
  const txt = (k) => {
    const v = params.get(k);
    return v && v !== "" ? v : null;
  };
  if (txt("q")) n++;
  if (txt("brand")) n++;
  if (txt("price_min")) n++;
  if (txt("price_max")) n++;
  if (txt("ram")) n++;
  if (txt("ram_min")) n++;
  if (txt("storage")) n++;
  if (txt("storage_min")) n++;
  if (txt("os")) n++;
  if (txt("processor")) n++;
  if (txt("display_min")) n++;
  if (txt("display_max")) n++;
  if (txt("refresh_rate_min")) n++;
  if (txt("battery_min")) n++;
  if (txt("charging_min")) n++;
  if (txt("camera_min")) n++;
  if (txt("front_camera_min")) n++;
  if (txt("expert_rating_min")) n++;
  if (txt("rating_avg_min")) n++;
  if (params.get("in_stock") === "true") n++;
  if (params.get("is_featured") === "true") n++;
  if (params.get("is_new_arrival") === "true") n++;
  n += params.getAll("cap").length;
  n += params.getAll("tag").length;
  return n;
}

function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="h-32 bg-surface-alt animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-16 bg-surface-alt animate-pulse rounded" />
        <div className="h-4 w-3/4 bg-surface-alt animate-pulse rounded" />
        <div className="h-4 w-1/3 bg-surface-alt animate-pulse rounded" />
        <div className="h-7 w-full bg-surface-alt animate-pulse rounded mt-2" />
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [recs, setRecs] = useState([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [scores, setScores] = useState({}); // productId -> match_score
  const [videos, setVideos] = useState([]);
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const setActiveCount = useRecFiltersStore((s) => s.setActiveCount);
  const resetFilters = useRecFiltersStore((s) => s.reset);

  const filters = useMemo(() => paramsToFilters(params), [params]);
  const suggestParams = useMemo(() => paramsToSuggestParams(params), [params]);
  const activeCount = useMemo(() => paramsToActiveCount(params), [params]);
  // Translate active catalog filters into the params the YouTube endpoint
  // understands. Only sent when at least one meaningful filter is set so we
  // don't waste an API call on the default landing view.
  const youtubeParams = useMemo(
    () => (activeCount > 0 ? paramsToYoutubeParams(params) : null),
    [params, activeCount]
  );

  useEffect(() => {
    productsApi.brands().then((b) => setBrands(b.results || b));
  }, []);

  useEffect(() => {
    setLoading(true);
    setApiError(null);
    productsApi
      .list(filters)
      .then((d) => {
        setData(d);
        // eslint-disable-next-line no-console
        console.log("[catalog] list ok", { filters, count: d?.count });
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[catalog] list failed", e);
        setApiError(
          e?.response?.data?.detail ||
            e?.message ||
            "Failed to load products (is the API on http://127.0.0.1:8000?)"
        );
        setData({ results: [], count: 0 });
      })
      .finally(() => setLoading(false));
  }, [filters]);

  // Fetch match scores for whatever filters are currently active. Returns the
  // top-50 scored candidates; we index by product id so cards can look up
  // their own score. Failures are silent — cards simply won't show a badge.
  useEffect(() => {
    if (activeCount === 0) {
      setScores({});
      return;
    }
    let alive = true;
    recsApi
      .suggest(suggestParams)
      .then((d) => {
        if (!alive) return;
        const map = {};
        for (const r of d.results || []) map[r.id] = r.match_score;
        setScores(map);
      })
      .catch(() => alive && setScores({}));
    return () => {
      alive = false;
    };
  }, [suggestParams, activeCount]);

  useEffect(() => {
    setRecsLoading(true);
    recsApi
      .aiPicks()
      .then((d) => {
        const list = Array.isArray(d) ? d : d.results || d.picks || [];
        setRecs(list.slice(0, 8));
      })
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false));
  }, []);

  // Pull YouTube suggestions that match the active filter set. Only runs
  // when at least one filter is applied, so the default landing view stays
  // quiet and we don't burn YouTube quota on every navigation.
  useEffect(() => {
    if (!youtubeParams) {
      setVideos([]);
      setActiveVideoId(null);
      return;
    }
    let alive = true;
    setVideoLoading(true);
    recsApi
      .youtube(youtubeParams)
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
    return () => {
      alive = false;
    };
  }, [youtubeParams]);

  // Publish filter count so Navbar can show/hide "For You"
  useEffect(() => {
    setActiveCount(activeCount);
  }, [activeCount, setActiveCount]);

  // Reset on unmount so leaving the catalog hides the nav link
  useEffect(() => {
    return () => resetFilters();
  }, [resetFilters]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    next.delete("page"); // any filter change resets pagination
    if (value === "" || value == null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const toggleTag = (key) => {
    const current = params.getAll("tag");
    const next = new URLSearchParams(params);
    next.delete("tag");
    next.delete("page");
    const updated = current.includes(key) ? current.filter((v) => v !== key) : [...current, key];
    updated.forEach((v) => next.append("tag", v));
    setParams(next, { replace: true });
  };

  const toggleCap = (key) => {
    const current = params.getAll("cap");
    const next = new URLSearchParams(params);
    next.delete("cap");
    next.delete("page");
    const updated = current.includes(key) ? current.filter((v) => v !== key) : [...current, key];
    updated.forEach((v) => next.append("cap", v));
    setParams(next, { replace: true });
  };

  const clearAll = () => setParams({}, { replace: true });

  const activeTags = params.getAll("tag");
  const activeCaps = params.getAll("cap");
  const hasAdvanced = !!(
    params.get("ram_min") ||
    params.get("storage_min") ||
    params.get("os") ||
    params.get("processor") ||
    params.get("display_min") ||
    params.get("display_max") ||
    params.get("refresh_rate_min") ||
    params.get("battery_min") ||
    params.get("charging_min") ||
    params.get("camera_min") ||
    params.get("front_camera_min") ||
    params.get("expert_rating_min") ||
    params.get("rating_avg_min") ||
    params.get("in_stock") === "true" ||
    params.get("is_featured") === "true" ||
    params.get("is_new_arrival") === "true"
  );

  return (
    <div className="container-page py-6">
      <div className="mb-5">
        <div className="eyebrow text-primary mb-1">Catalog</div>
        <h1 className="text-headline-lg text-ink">All smartphones</h1>
        <p className="text-body-md text-ink-muted mt-1">
          {loading ? "Loading…" : `${data?.count || 0} phones available`}
        </p>
        {apiError && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            API error: {apiError}
          </div>
        )}
      </div>

      {/* For You strip */}
      {!loading && recs.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="auto_awesome" size={20} className="text-accent-gold" filled />
              <h2 className="text-title-lg text-ink">For You</h2>
              <span className="text-label-sm text-ink-subtle">AI picks</span>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto hide-scrollbar -mx-2 px-2 pb-2">
            {recsLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="shrink-0 w-44">
                    <ProductCardSkeleton />
                  </div>
                ))
              : recs.map((p) => (
                  <div key={p.id} className="shrink-0 w-44">
                    <ProductCard product={p} compact />
                  </div>
                ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-[260px_1fr] gap-6">
        {/* Filters sidebar */}
        <aside className="card p-5 h-fit lg:sticky lg:top-20">
          <div className="flex items-center justify-between mb-4">
            <div className="text-title-md text-ink">Filters</div>
            <button className="text-primary text-label-md" onClick={clearAll}>
              Clear all
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <div className="label">Search</div>
              <input
                className="input"
                placeholder="Galaxy, Pixel, Snapdragon…"
                defaultValue={params.get("q") || ""}
                onKeyDown={(e) => e.key === "Enter" && setParam("q", e.target.value)}
                onBlur={(e) => setParam("q", e.target.value)}
              />
            </div>

            <div>
              <div className="label">Brand</div>
              <select
                className="input"
                value={params.get("brand") || ""}
                onChange={(e) => setParam("brand", e.target.value)}
              >
                <option value="">All brands</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.slug}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="label">Price (BDT)</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="input"
                  placeholder="Min"
                  defaultValue={params.get("price_min") || ""}
                  onBlur={(e) => setParam("price_min", e.target.value)}
                />
                <span className="text-ink-subtle">–</span>
                <input
                  type="number"
                  className="input"
                  placeholder="Max"
                  defaultValue={params.get("price_max") || ""}
                  onBlur={(e) => setParam("price_max", e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="label">Network capabilities</div>
              <div className="flex flex-wrap gap-2">
                {CAPABILITIES.map((c) => {
                  const active = activeCaps.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleCap(c.key)}
                      className={active ? "chip-primary" : "chip"}
                      title={c.label}
                    >
                      {active ? <Icon name="check" size={14} /> : <Icon name={c.icon} size={14} />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="label">Editor's picks</div>
              <div className="flex flex-wrap gap-2">
                {TAGS.map((t) => {
                  const active = activeTags.includes(t.key);
                  return (
                    <button
                      key={t.key}
                      onClick={() => toggleTag(t.key)}
                      className={active ? "chip-primary" : "chip"}
                    >
                      {active ? <Icon name="check" size={14} /> : null}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <details open={hasAdvanced || true} className="group">
              <summary className="cursor-pointer flex items-center justify-between text-title-md text-ink py-1 list-none">
                <span className="flex items-center gap-1">
                  <Icon name="tune" size={16} /> Advanced
                </span>
                <Icon name="expand_more" size={18} className="group-open:rotate-180 transition-transform" />
              </summary>

              <div className="space-y-4 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="label">RAM (GB+)</div>
                    <select
                      className="input"
                      value={params.get("ram_min") || ""}
                      onChange={(e) => setParam("ram_min", e.target.value)}
                    >
                      <option value="">Any</option>
                      {[4, 6, 8, 12, 16].map((n) => (
                        <option key={n} value={n}>{n} GB+</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="label">Exact RAM</div>
                    <select
                      className="input"
                      value={params.get("ram") || ""}
                      onChange={(e) => setParam("ram", e.target.value)}
                    >
                      <option value="">Any</option>
                      {[4, 6, 8, 12, 16].map((n) => (
                        <option key={n} value={n}>{n} GB</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="label">Storage (GB+)</div>
                    <select
                      className="input"
                      value={params.get("storage_min") || ""}
                      onChange={(e) => setParam("storage_min", e.target.value)}
                    >
                      <option value="">Any</option>
                      {[64, 128, 256, 512, 1024].map((n) => (
                        <option key={n} value={n}>{n >= 1024 ? "1 TB+" : `${n} GB+`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="label">Exact storage</div>
                    <select
                      className="input"
                      value={params.get("storage") || ""}
                      onChange={(e) => setParam("storage", e.target.value)}
                    >
                      <option value="">Any</option>
                      {[64, 128, 256, 512, 1024].map((n) => (
                        <option key={n} value={n}>{n >= 1024 ? "1 TB" : `${n} GB`}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="label">Operating system</div>
                  <select
                    className="input"
                    value={params.get("os") || ""}
                    onChange={(e) => setParam("os", e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="Android">Android</option>
                    <option value="iOS">iOS</option>
                  </select>
                </div>

                <div>
                  <div className="label">Processor contains</div>
                  <input
                    className="input"
                    placeholder="Snapdragon, A17, Dimensity…"
                    defaultValue={params.get("processor") || ""}
                    onBlur={(e) => setParam("processor", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setParam("processor", e.target.value)}
                  />
                </div>

                <div>
                  <div className="label">Display size (inches)</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      placeholder="Min"
                      defaultValue={params.get("display_min") || ""}
                      onBlur={(e) => setParam("display_min", e.target.value)}
                    />
                    <span className="text-ink-subtle">–</span>
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      placeholder="Max"
                      defaultValue={params.get("display_max") || ""}
                      onBlur={(e) => setParam("display_max", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <div className="label">Min refresh rate (Hz)</div>
                  <select
                    className="input"
                    value={params.get("refresh_rate_min") || ""}
                    onChange={(e) => setParam("refresh_rate_min", e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="60">60 Hz+</option>
                    <option value="90">90 Hz+</option>
                    <option value="120">120 Hz+</option>
                    <option value="144">144 Hz+</option>
                  </select>
                </div>

                <div>
                  <div className="label">Battery (mAh+)</div>
                  <select
                    className="input"
                    value={params.get("battery_min") || ""}
                    onChange={(e) => setParam("battery_min", e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="3000">3,000 mAh+</option>
                    <option value="4000">4,000 mAh+</option>
                    <option value="4500">4,500 mAh+</option>
                    <option value="5000">5,000 mAh+</option>
                    <option value="5500">5,500 mAh+</option>
                    <option value="6000">6,000 mAh+</option>
                  </select>
                </div>

                <div>
                  <div className="label">Wired charging (W+)</div>
                  <select
                    className="input"
                    value={params.get("charging_min") || ""}
                    onChange={(e) => setParam("charging_min", e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="15">15 W+</option>
                    <option value="25">25 W+</option>
                    <option value="45">45 W+</option>
                    <option value="65">65 W+</option>
                    <option value="100">100 W+</option>
                    <option value="120">120 W+</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="label">Rear cam (MP+)</div>
                    <select
                      className="input"
                      value={params.get("camera_min") || ""}
                      onChange={(e) => setParam("camera_min", e.target.value)}
                    >
                      <option value="">Any</option>
                      {[12, 24, 48, 64, 108, 200].map((n) => (
                        <option key={n} value={n}>{n} MP+</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="label">Selfie cam (MP+)</div>
                    <select
                      className="input"
                      value={params.get("front_camera_min") || ""}
                      onChange={(e) => setParam("front_camera_min", e.target.value)}
                    >
                      <option value="">Any</option>
                      {[8, 12, 16, 20, 32, 40].map((n) => (
                        <option key={n} value={n}>{n} MP+</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="label">Expert rating</div>
                  <select
                    className="input"
                    value={params.get("expert_rating_min") || ""}
                    onChange={(e) => setParam("expert_rating_min", e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="9">9+ stars</option>
                    <option value="8">8+ stars</option>
                    <option value="7">7+ stars</option>
                    <option value="6">6+ stars</option>
                  </select>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-surface-border accent-primary"
                      checked={params.get("in_stock") === "true"}
                      onChange={(e) => setParam("in_stock", e.target.checked ? "true" : "")}
                    />
                    <span className="text-body-md text-ink">In stock only</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-surface-border accent-primary"
                      checked={params.get("is_featured") === "true"}
                      onChange={(e) => setParam("is_featured", e.target.checked ? "true" : "")}
                    />
                    <span className="text-body-md text-ink">Featured only</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-surface-border accent-primary"
                      checked={params.get("is_new_arrival") === "true"}
                      onChange={(e) => setParam("is_new_arrival", e.target.checked ? "true" : "")}
                    />
                    <span className="text-body-md text-ink">New arrivals</span>
                  </label>
                </div>
              </div>
            </details>
          </div>
        </aside>

        {/* Results */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-body-md text-ink-muted">
              {loading ? "Loading…" : `${data?.count || 0} results`}
            </div>
            <select
              className="input w-auto"
              value={params.get("sort") || "newest"}
              onChange={(e) => setParam("sort", e.target.value)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : data?.results?.length ? (
            <>
              <FilterVideoCard
                videos={videos}
                activeVideoId={activeVideoId}
                onSelect={setActiveVideoId}
                loading={videoLoading}
                activeCount={activeCount}
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {data.results.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    compact
                    matchScore={scores[p.id] ?? null}
                    activeCount={activeCount}
                  />
                ))}
              </div>
              <Pagination
                count={data.count}
                page={Number(filters.page) || 1}
                pageSize={20}
                onPage={(n) => setParam("page", n === 1 ? "" : String(n))}
              />
            </>
          ) : (
            <EmptyState
              icon="search_off"
              title="No phones match your filters"
              message="Try clearing some filters or broadening your price range."
              action={
                <button onClick={clearAll} className="btn-primary">
                  Clear filters
                </button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Pagination({ count, page, pageSize, onPage }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-10">
      {Array.from({ length: pages }).map((_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            onClick={() => onPage(n)}
            className={n === page ? "btn-primary" : "btn-ghost"}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

// Inline YouTube card has moved to components/FilterVideoCard.jsx so it can
// be shared between the Catalog page and the For You recommendations page.
