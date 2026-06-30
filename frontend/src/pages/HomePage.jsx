import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productsApi, recsApi } from "../api";
import ProductCard from "../components/ProductCard";
import Spinner from "../components/Spinner";
import Icon from "../components/Icon";

export default function HomePage() {
  const [featured, setFeatured] = useState(null);
  const [brands, setBrands] = useState([]);
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [f, b, p] = await Promise.all([
          productsApi.featured(),
          productsApi.brands(),
          recsApi.aiPicks(),
        ]);
        if (!alive) return;
        setFeatured(f);
        setBrands(b.results || b);
        setPicks(Array.isArray(p) ? p : []);
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
              <Stat label="Phones" value="12+" />
              <div className="w-px h-10 bg-white/20" />
              <Stat label="Brands" value="4" />
              <div className="w-px h-10 bg-white/20" />
              <Stat label="Customers" value="10k+" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {picks.slice(0, 4).map((p) => (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {deals.slice(0, 6).map((p) => (
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
                className="card card-hover p-6 flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-3">
                  <Icon name="smartphone" className="text-primary" />
                </div>
                <div className="text-title-md text-ink">{b.name}</div>
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