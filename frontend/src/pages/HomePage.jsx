import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { productsApi, recsApi } from "../api";
import { absoluteMediaUrl } from "../api/client";
import ProductCard from "../components/ProductCard";
import Spinner from "../components/Spinner";
import Icon from "../components/Icon";

export default function HomePage() {
  const [featured, setFeatured] = useState(null);
  const [brands, setBrands] = useState([]);
  const [picks, setPicks] = useState([]);
  const [stats, setStats] = useState({ phones: 0, brands: 0, customers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [f, b, p, s] = await Promise.all([
          productsApi.featured(),
          productsApi.brands(),
          recsApi.aiPicks(),
          productsApi.stats().catch(() => null),
        ]);
        if (!alive) return;
        setFeatured(f);
        setBrands(b.results || b);
        setPicks(Array.isArray(p) ? p : []);
        if (s) setStats(s);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <Spinner />;

  const trending = featured?.trending || [];
  const deals = featured?.best_deals || [];
  const hero = featured?.hero?.is_active ? featured.hero : null;
  const heroProduct = hero?.product || null;
  const heroEyebrow = hero?.eyebrow || "Premium Tech Core · 2024 Lineup";
  const heroTitle = hero?.title || "The phone you actually want.";
  const heroSubtitle = hero?.subtitle || "Curated flagship smartphones";

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary-700 text-white">
        <div className="container-page py-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="eyebrow text-primary-200 mb-3">{heroEyebrow}</div>
            <h1 className="text-display-md md:text-display-lg font-bold leading-tight">
              {heroTitle}
            </h1>
            <p className="text-body-lg text-primary-100 mt-4 max-w-md">
              Curated flagship smartphones, expert reviews, and a checkout built for tech-savvy buyers.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/catalog" className="btn bg-white text-primary hover:bg-primary-50">
                Shop all phones <Icon name="arrow_forward" size={20} />
              </Link>
              {heroProduct && (
                <Link
                  to={`/products/${heroProduct.slug}`}
                  className="btn border border-white/40 text-white hover:bg-white/10"
                >
                  View {heroProduct.brand_name}
                </Link>
              )}
            </div>
            <div className="flex items-center gap-6 mt-10">
              <Stat label="Phones" value={formatCount(stats.phones, "+")} />
              <div className="w-px h-10 bg-white/20" />
              <Stat label="Brands" value={formatCount(stats.brands)} />
              <div className="w-px h-10 bg-white/20" />
              <Stat label="Customers" value={formatCount(stats.customers, "+")} />
            </div>
          </div>
          <div className="relative">
            <div className="aspect-square max-w-md ml-auto rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center overflow-hidden p-6">
              {heroProduct ? (
                <Link
                  to={`/products/${heroProduct.slug}`}
                  className="text-center flex flex-col items-center justify-center w-full h-full"
                >
                  <img
                    src={heroProduct.image}
                    alt={heroProduct.name}
                    className="max-h-[70%] w-auto object-contain drop-shadow-2xl"
                  />
                  <div className="text-title-md text-white mt-3">
                    Featured today
                  </div>
                  <div className="text-label-md text-primary-200 mt-1">
                    {heroProduct.brand_name} · {heroProduct.name}
                  </div>
                  {heroSubtitle && (
                    <div className="text-label-sm text-white/70 mt-1">
                      {heroSubtitle}
                    </div>
                  )}
                </Link>
              ) : (
                <div className="text-center">
                  <Icon name="smartphone" size={120} className="text-white/90" />
                  <div className="text-title-md text-white mt-2">Featured today</div>
                  <div className="text-label-md text-primary-200">Premium smartphones</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* AI Picks */}
      {picks.length > 0 && (
        <section className="container-page py-14">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="eyebrow text-primary mb-1">Curated for you</div>
              <h2 className="section-title flex items-center gap-2">
                <Icon name="auto_awesome" className="text-accent-gold" filled /> AI Picks
              </h2>
            </div>
            <Link to="/catalog" className="link text-label-md flex items-center gap-1">
              Browse all <Icon name="arrow_forward" size={18} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {picks.slice(0, 5).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Trending */}
      {trending.length > 0 && (
        <section className="container-page py-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="eyebrow text-primary mb-1">Popular this week</div>
              <h2 className="section-title flex items-center gap-2">
                <Icon name="trending_up" className="text-primary" /> Trending
              </h2>
            </div>
            <Link to="/catalog?sort=popular" className="link text-label-md">View all</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {trending.slice(0, 5).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Best Deals */}
      {deals.length > 0 && (
        <section className="bg-surface-alt py-14">
          <div className="container-page">
            <div className="flex items-end justify-between mb-6">
              <div>
                <div className="eyebrow text-primary mb-1">Save more</div>
                <h2 className="section-title flex items-center gap-2">
                  <Icon name="local_offer" className="text-accent-gold" filled /> Best deals
                </h2>
              </div>
              <Link to="/catalog?sort=price_asc" className="link text-label-md">All deals</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {deals.slice(0, 5).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Brands */}
      {brands.length > 0 && (
        <section className="container-page py-14">
          <div className="text-center mb-8">
            <div className="eyebrow text-primary mb-1">Shop by brand</div>
            <h2 className="section-title">Premium brands we love</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {brands.map((b) => (
              <Link
                key={b.id}
                to={`/catalog?brand=${b.slug}`}
                className="group card card-hover p-6 flex flex-col items-center text-center"
              >
                <div
                  className="w-20 h-20 rounded-full bg-white ring-1 ring-surface-border flex items-center justify-center mb-3 overflow-hidden transition group-hover:ring-primary group-hover:shadow-soft relative"
                  style={{ color: BRAND_COLORS[b.name] || "#1f2937" }}
                >
                  <BrandLogo brand={b} />
                </div>
                <div className="text-title-md text-ink group-hover:text-primary transition">
                  {b.name}
                </div>
                {b.country && (
                  <div className="text-label-sm text-ink-subtle mt-0.5">
                    {b.country}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container-page py-14">
        <div className="card p-10 flex flex-col md:flex-row items-center gap-6 bg-gradient-to-br from-primary to-primary-700 text-white border-0">
          <div className="flex-1">
            <div className="text-headline-md">Need help choosing?</div>
            <div className="text-body-md text-primary-100 mt-1">
              Read expert reviews, compare specs, and watch YouTube breakdowns — all on every product page.
            </div>
          </div>
          <Link to="/catalog" className="btn bg-accent-gold text-white hover:brightness-95">
            Start exploring <Icon name="arrow_forward" size={20} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-headline-md text-white">{value}</div>
      <div className="text-label-sm text-primary-200">{label}</div>
    </div>
  );
}

// BrandLogo: tries the remote `b.logo` URL, and on any error (network,
// 404, blocked, slow) swaps in a coloured 2-letter wordmark so users
// never see a broken-image icon or the raw alt text. Falls back to a
// brand-specific accent when possible so each tile looks unique.
function BrandLogo({ brand }) {
  const [errored, setErrored] = useState(false);

  // Per-brand accent + wordmark text. The wordmark uses the first two
  // letters, or first + last letter when the brand name is a single word
  // shorter than that (e.g. "LG", "ZTE").
  const mark = useMemo(() => computeMark(brand), [brand]);
  if (!brand.logo || errored) return mark;

  return (
    <img
      src={absoluteMediaUrl(brand.logo)}
      alt={brand.name}
      loading="lazy"
      onError={() => setErrored(true)}
      className="w-full h-full object-contain p-2"
    />
  );
}

// Deterministic palette: each brand is keyed to a named brand colour where
// one is well-known; everything else gets a stable HSL derived from the
// name so the colour never changes between renders.
const BRAND_COLORS = {
  Apple: "#111111",
  Samsung: "#1428A0",
  Google: "#4285F4",
  OnePlus: "#EB0028",
  Xiaomi: "#FF6700",
  Oppo: "#1A6D2A",
  Vivo: "#415FFF",
  Realme: "#FFC901",
  Huawei: "#CF0A2C",
  Honor: "#008CFF",
  Motorola: "#1F4FB6",
  Nokia: "#124191",
  Sony: "#000000",
  HTC: "#8AC143",
  Asus: "#00539B",
  Lenovo: "#E2231A",
  Nothing: "#FFFFFF",
  Poco: "#FFCB00",
  Tecno: "#0066B3",
  Infinix: "#0066B3",
  Itel: "#E2231A",
  Lava: "#E2231A",
  Micromax: "#005BAA",
  Meizu: "#0080C6",
  Sharp: "#BE2D2D",
  ZTE: "#005BAC",
  iQOO: "#FFC700",
  Alcatel: "#E2231A",
  Cat: "#FFC107",
};

function computeMark(brand) {
  const name = (brand?.name || "?").trim();
  let text = name.slice(0, 2);
  if (name.length > 2 && /^[A-Z]/i.test(name[0]) && /[A-Z]$/i.test(name[name.length - 1])) {
    // e.g. "Infinix" -> "In", "Micromax" -> "Mx", "OnePlus" -> "Os"
    text = (name[0] + name[name.length - 1]).toUpperCase();
  } else {
    text = text.toUpperCase();
  }

  const color = BRAND_COLORS[name] || hashToColor(name);
  return (
    <span
      className="w-full h-full flex items-center justify-center font-extrabold tracking-tight"
      style={{
        color,
        // Nothing's white wordmark needs a dark ring so it stays visible
        // on the white tile background.
        background:
          name === "Nothing" ? "#111111" : "transparent",
        letterSpacing: "-0.04em",
      }}
    >
      <span
        style={{
          color: name === "Nothing" ? "#FFFFFF" : color,
          fontSize: "1.6rem",
          lineHeight: 1,
        }}
      >
        {text}
      </span>
    </span>
  );
}

function hashToColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = str.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 65% 38%)`;
}

// Compact number formatter: 105 → "105+", 1234 → "1.2k+", 22000 → "22k+".
// Falls back to "0" when value is missing/null so the strip never blanks out
// if the stats endpoint is down.
function formatCount(n, suffix = "") {
  const v = Number(n) || 0;
  if (v >= 1000) {
    const k = v / 1000;
    return `${(k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, ""))}k${suffix}`;
  }
  return `${v}${suffix}`;
}