import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import { fmt } from "../../lib/format";
import Icon from "../../components/Icon";
import Spinner from "../../components/Spinner";

export default function AdminHero() {
  const [hero, setHero] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Editable form state
  const [productId, setProductId] = useState("");
  const [eyebrow, setEyebrow] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, p] = await Promise.all([
          adminApi.getHero(),
          // /admin/products/ returns every active product in one shot — the
          // public /products/ endpoint is paginated and would cap us at ~100,
          // which is why some phones were missing from the dropdown before.
          adminApi.adminProducts(),
        ]);
        if (!alive) return;
        setHero(h);
        setProducts(p.results || p || []);
        setProductId(h.product?.id ?? "");
        setEyebrow(h.eyebrow ?? "");
        setTitle(h.title ?? "");
        setSubtitle(h.subtitle ?? "");
        setIsActive(Boolean(h.is_active));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selected = useMemo(
    () => products.find((p) => String(p.id) === String(productId)) || null,
    [products, productId]
  );

  const showToast = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2400);
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        product_id: productId === "" ? null : Number(productId),
        eyebrow: eyebrow.trim(),
        title: title.trim(),
        subtitle: subtitle.trim(),
        is_active: isActive,
      };
      const updated = await adminApi.updateHero(payload);
      setHero(updated);
      showToast("Featured-today hero updated.", "success");
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data || {}) ||
        "Failed to save.";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    if (!confirm("Remove the featured product? The hero will fall back to the static icon.")) return;
    setSaving(true);
    try {
      const updated = await adminApi.updateHero({
        product_id: null,
        eyebrow,
        title,
        subtitle,
        is_active: false,
      });
      setHero(updated);
      setProductId("");
      setIsActive(false);
      showToast("Hero product cleared.", "success");
    } catch (err) {
      showToast("Failed to clear.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow text-primary mb-1">Storefront</div>
          <h1 className="text-headline-md font-headline-md">Featured today (Home hero)</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Pick the phone shown in the home-page hero panel. Leave empty to hide the product.
          </p>
        </div>
      </div>

      <form
        onSubmit={onSave}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Left: form */}
        <div className="lg:col-span-2 bg-white border border-surface-border rounded-2xl p-6 space-y-5">
          <div>
            <label className="text-label-md text-ink block mb-2">
              Featured product
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="input w-full"
              disabled={saving}
            >
              <option value="">— No product (show static icon) —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand_name ? `${p.brand_name} · ` : ""}
                  {p.name} ({fmt.money(p.price)})
                </option>
              ))}
            </select>
            <p className="text-label-sm text-ink-muted mt-2">
              Choose a phone to feature. Only one product can be featured at a time.
            </p>
          </div>

          <div>
            <label className="text-label-md text-ink block mb-2">
              Eyebrow text
            </label>
            <input
              type="text"
              value={eyebrow}
              onChange={(e) => setEyebrow(e.target.value)}
              className="input w-full"
              placeholder="Premium Tech Core · 2024 Lineup"
              disabled={saving}
              maxLength={120}
            />
          </div>

          <div>
            <label className="text-label-md text-ink block mb-2">
              Hero title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full"
              placeholder="The phone you actually want."
              disabled={saving}
              maxLength={120}
            />
          </div>

          <div>
            <label className="text-label-md text-ink block mb-2">
              Subtitle (under the image)
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="input w-full"
              placeholder="Premium smartphones"
              disabled={saving}
              maxLength={120}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={saving}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-label-md text-ink">
              Show on home page
              <span className="block text-label-sm text-ink-muted mt-0.5">
                When off, the home hero panel hides the product image and falls back to the static icon.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-3 pt-3 border-t border-surface-border">
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              <Icon name="save" size={18} />
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="btn-outline"
              disabled={saving || !hero?.product}
            >
              <Icon name="delete" size={18} />
              Clear featured product
            </button>
          </div>

          {toast && (
            <div
              className={`mt-2 px-4 py-3 rounded-md text-label-md ${
                toast.kind === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {toast.msg}
            </div>
          )}
        </div>

        {/* Right: live preview */}
        <div className="bg-white border border-surface-border rounded-2xl p-6 space-y-4">
          <div className="text-label-md text-ink-muted uppercase tracking-wide">
            Live preview
          </div>

          <div className="rounded-xl overflow-hidden bg-gradient-to-br from-primary to-primary-700 text-white">
            <div className="p-6">
              <div className="text-label-sm text-primary-200 mb-2">
                {eyebrow || "Premium Tech Core · 2024 Lineup"}
              </div>
              <div className="text-headline-sm font-headline-sm leading-tight">
                {title || "The phone you actually want."}
              </div>
            </div>
            <div className="aspect-square bg-white/10 backdrop-blur-sm border-t border-white/20 flex items-center justify-center p-6">
              {selected?.image ? (
                <div className="text-center">
                  <img
                    src={selected.image}
                    alt={selected.name}
                    className="max-h-[60%] w-auto mx-auto object-contain drop-shadow-2xl"
                  />
                  <div className="text-label-md text-white mt-3">Featured today</div>
                  <div className="text-label-sm text-primary-200 mt-1">
                    {selected.brand_name} · {selected.name}
                  </div>
                  {subtitle && (
                    <div className="text-label-sm text-white/70 mt-1">{subtitle}</div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <Icon name="smartphone" size={96} className="text-white/90" />
                  <div className="text-label-md text-white mt-2">Featured today</div>
                  <div className="text-label-sm text-primary-200">Premium smartphones</div>
                </div>
              )}
            </div>
          </div>

          <div className="text-label-sm text-ink-muted">
            Last updated:{" "}
            <span className="text-ink">
              {hero?.updated_at
                ? new Date(hero.updated_at).toLocaleString()
                : "—"}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}
