import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { productsApi, recsApi, ordersApi } from "../api";
import Spinner from "../components/Spinner";
import Icon from "../components/Icon";
import ProductCard from "../components/ProductCard";
import { useCartStore } from "../stores/cartStore";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { useCompareStore } from "../stores/compareStore";
import { fmt } from "../lib/format";

// --------------------------------------------------------------------------- //
// Spec section definitions — kept in one place so the design stays consistent
// --------------------------------------------------------------------------- //
const SPEC_SECTIONS = [
  {
    key: "display",
    title: "Display",
    icon: "smart_screen",
    rows: (s) => [
      ["Type", s.display_type_label],
      ["Size", `${s.display_inches || "—"} in (${s.display_cm || "—"} cm)`],
      [
        "Resolution",
        s.resolution_width && s.resolution_height
          ? `${s.resolution_width} × ${s.resolution_height} ${s.resolution_label || ""}`.trim()
          : null,
      ],
      ["Aspect ratio", s.aspect_ratio],
      ["Pixel density", s.pixel_density_ppi ? `${s.pixel_density_ppi} ppi` : null],
      ["Screen-to-body", s.screen_to_body_ratio_pct ? `${s.screen_to_body_ratio_pct}%` : null],
      [
        "Brightness",
        s.brightness_typical_nits
          ? `${s.brightness_typical_nits} nits (peak ${s.brightness_peak_nits || "—"})`
          : null,
      ],
      ["HDR", s.hdr_support],
      ["Protection", s.screen_protection],
      ["Notch", s.notch_type],
      ["Touch screen", s.touch_screen],
      [
        "Refresh rate",
        s.refresh_rate_secondary_hz
          ? `${s.refresh_rate_hz} Hz / ${s.refresh_rate_secondary_hz} Hz`
          : `${s.refresh_rate_hz || 60} Hz`,
      ],
      ["Always-on display", s.always_on_display ? "Yes" : "No"],
      ["Bezel-less", s.bezel_less ? "Yes" : "No"],
    ],
  },
  {
    key: "hardware",
    title: "Hardware / Chipset",
    icon: "memory",
    rows: (s) => [
      ["OS", s.os ? `${s.os} ${s.os_version || ""}`.trim() : null],
      ["Chipset", s.chipset],
      ["Processor", s.processor],
      ["CPU details", s.cpu_details],
      [
        "Cores / Architecture",
        s.cpu_cores ? `${s.cpu_cores}-core, ${s.architecture || "—"}` : null,
      ],
      ["Fabrication", s.fabrication_nm ? `${s.fabrication_nm} nm` : null],
      ["GPU", s.gpu],
    ],
  },
  {
    key: "memory",
    title: "Memory & Storage",
    icon: "storage",
    rows: (s) => [
      ["RAM", s.ram_gb ? `${s.ram_gb} GB ${s.ram_type || ""}`.trim() : null],
      ["Internal storage", s.storage_gb ? `${s.storage_gb} GB ${s.storage_type || ""}`.trim() : null],
      ["USB OTG", s.usb_otg ? "Yes" : "No"],
    ],
  },
  {
    key: "camera_rear",
    title: "Camera — Rear",
    icon: "photo_camera",
    rows: (s) => [
      ["Setup", s.camera_setup],
      ["Resolution", s.camera_resolution_detail || (s.camera_resolution_mp ? `${s.camera_resolution_mp} MP` : null)],
      ["Aperture", s.camera_aperture],
      ["Sensor", s.camera_sensor],
      ["Sensor size", s.camera_sensor_size],
      ["Focal length", s.camera_focal_length],
      ["Autofocus", s.camera_autofocus ? "Yes" : "No"],
      ["OIS", s.camera_ois ? "Yes" : "No"],
      ["EIS", s.camera_eis ? "Yes" : "No"],
      ["Flash", s.camera_flash],
      ["Image resolution", s.camera_image_resolution],
      ["Settings", s.camera_settings],
      ["Zoom", s.camera_zoom],
      ["Shooting modes", s.camera_shooting_modes],
      ["Features", s.camera_features],
      ["Video", s.camera_video_resolution],
      ["FPS", s.camera_video_fps],
    ],
  },
  {
    key: "camera_front",
    title: "Camera — Selfie",
    icon: "camera_front",
    rows: (s) => [
      ["Setup", s.front_camera_setup],
      ["Resolution", s.front_camera_mp ? `${s.front_camera_mp} MP` : null],
      ["Aperture", s.front_camera_aperture],
      ["Autofocus", s.front_camera_autofocus ? "Yes" : "No"],
      ["Flash", s.front_camera_flash ? "Yes" : "No"],
      ["Video", s.front_camera_video_resolution],
      ["Features", s.front_camera_features],
    ],
  },
  {
    key: "design",
    title: "Design",
    icon: "phone_iphone",
    rows: (s) => [
      [
        "Dimensions",
        s.height_mm && s.width_mm && s.thickness_mm
          ? `${s.height_mm} × ${s.width_mm} × ${s.thickness_mm} mm`
          : null,
      ],
      ["Weight", s.weight_g ? `${s.weight_g} g` : null],
      ["Build", s.build_material],
      ["IP rating", s.ip_rating],
      ["Waterproof", s.waterproof],
      ["Ruggedness", s.ruggedness],
      ["Form factor", s.form_factor],
    ],
  },
  {
    key: "battery",
    title: "Battery",
    icon: "battery_charging_full",
    rows: (s) => [
      ["Type", s.battery_type],
      ["Capacity", s.battery_mah ? `${s.battery_mah} mAh` : null],
      ["Quick charging", s.quick_charging],
      ["Wired", s.charging_watts ? `${s.charging_watts} W` : null],
      ["Wireless", s.wireless_charging],
      ["Placement", s.battery_placement],
      ["USB", s.usb_type],
    ],
  },
  {
    key: "network",
    title: "Network & Connectivity",
    icon: "network_cell",
    rows: (s) => [
      [
        "Technology",
        ["2G", "3G", "4G", "5G"]
          .map((g) => (s[`has_${g.toLowerCase()}`] ? g : null))
          .filter(Boolean)
          .join(" / ") || null,
      ],
      ["Bands", s.network_bands],
      ["SIM slot", s.sim_slot],
      ["SIM size", s.sim_size],
      ["EDGE / GPRS", `${s.edge ? "EDGE" : "—"} / ${s.gprs ? "GPRS" : "—"}`],
      ["VoLTE", s.volte ? "Yes" : "No"],
      ["Speed", s.network_speed],
      ["WLAN", s.wlan],
      ["Bluetooth", s.bluetooth],
      ["GPS", s.gps],
      ["NFC", s.nfc ? "Yes" : "No"],
      ["Infrared", s.infrared ? "Yes" : "No"],
      ["Wi-Fi hotspot", s.wifi_hotspot ? "Yes" : "No"],
    ],
  },
  {
    key: "sensors",
    title: "Sensors",
    icon: "sensors",
    rows: (s) => [
      ["Fingerprint", s.fingerprint_sensor ? `${s.fingerprint_position || "Yes"}${s.fingerprint_type ? ` (${s.fingerprint_type})` : ""}` : "No"],
      ["Face unlock", s.face_unlock ? "Yes" : "No"],
      ["Sensors", s.sensors_list],
    ],
  },
  {
    key: "multimedia",
    title: "Multimedia",
    icon: "volume_up",
    rows: (s) => [
      ["Loudspeaker", s.loudspeaker ? "Yes" : "No"],
      ["Audio jack", s.audio_jack],
      ["Audio features", s.audio_features],
      ["Video formats", s.video_formats],
    ],
  },
];

const DISPLAY_TYPE_LABELS = {
  amoled: "AMOLED",
  ltps_amoled: "LTPS AMOLED",
  ltpo_amoled: "LTPO AMOLED",
  oled: "OLED",
  ips_lcd: "IPS LCD",
  tft: "TFT",
  pls_lcd: "PLS LCD",
};

const MARKET_STATUS_LABELS = {
  available: "Available",
  upcoming: "Upcoming",
  rumored: "Rumored",
  discontinued: "Discontinued",
};

const SUB_RATINGS = [
  { key: "design_score", label: "Design" },
  { key: "display_score", label: "Display" },
  { key: "performance_score", label: "Performance" },
  { key: "camera_score", label: "Camera" },
  { key: "battery_score", label: "Battery" },
  { key: "software_score", label: "Software" },
  { key: "connectivity_score", label: "Connectivity" },
  { key: "value_score", label: "Value" },
];

// --------------------------------------------------------------------------- //
// Small sub-components
// --------------------------------------------------------------------------- //
function ScoreRing({ value = 0, size = 64, stroke = 6, label }) {
  const safe = Math.max(0, Math.min(10, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - safe / 10);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" className="text-surface-border" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="currentColor"
            className={safe >= 8 ? "text-accent-success" : safe >= 6 ? "text-accent-gold" : "text-accent-danger"}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={off}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-title-md font-semibold text-ink">
          {safe.toFixed(1)}
        </div>
      </div>
      {label && <div className="text-label-sm text-ink-muted">{label}</div>}
    </div>
  );
}

function SpecRow({ label, value }) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <tr className="border-t border-surface-border">
      <td className="py-3 px-4 text-label-md text-ink-muted w-1/3 align-top">{label}</td>
      <td className="py-3 px-4 text-body-md text-ink">{value}</td>
    </tr>
  );
}

function Benefit({ icon, title, sub }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-primary-50 text-primary flex items-center justify-center">
        <Icon name={icon} size={22} />
      </div>
      <div>
        <div className="text-label-md text-ink">{title}</div>
        <div className="text-label-sm text-ink-subtle">{sub}</div>
      </div>
    </div>
  );
}

function ColorSwatch({ color, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-2 px-2 py-1 rounded-sm border ${
        selected ? "border-primary bg-primary-50" : "border-surface-border bg-white"
      } hover:border-primary transition`}
      title={color.name}
    >
      <span
        className="w-5 h-5 rounded-full border border-surface-border"
        style={{ background: color.hex || "#ccc" }}
      />
      <span className="text-label-md text-ink">{color.name}</span>
    </button>
  );
}

// --------------------------------------------------------------------------- //
// Page
// --------------------------------------------------------------------------- //
export default function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [videos, setVideos] = useState([]);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [activeTab, setActiveTab] = useState("details");
  const [openSections, setOpenSections] = useState(() =>
    SPEC_SECTIONS.reduce((acc, s) => ({ ...acc, [s.key]: true }), {})
  );

  // Review-form state. `myRating` keeps the picker value while the user types,
  // `submitting` disables the button during the network call.
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myTitle, setMyTitle] = useState("");
  const [myComment, setMyComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const addToCart = useCartStore((s) => s.addItem);
  const isAuth = useAuthStore((s) => !!s.access);
  const isAdmin = useAuthStore((s) => !!(s.user?.is_admin || s.user?.is_staff));
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const notify = useUIStore((s) => s.notify);
  const compare = useCompareStore();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setActiveImage(0);
    setSelectedVariant(null);
    setSelectedColor(null);
    (async () => {
      try {
        const [p, r] = await Promise.all([
          productsApi.detail(slug),
          productsApi.reviews(slug).catch(() => []),
        ]);
        if (!alive) return;
        setProduct(p);
        setReviews(Array.isArray(r) ? r : r.results || []);
        // Default selections
        if (p.variants?.length) setSelectedVariant(p.variants[0]);
        if (p.colors?.length) setSelectedColor(p.colors[0]);
        try {
          const v = await recsApi.youtube({
            brand: p.brand?.name,
            use_case: p.use_case_tag || "",
            specs: p.processor,
          });
          if (!alive) return;
          setVideos(v.results || []);
        } catch { /* YouTube optional */ }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const spec = useMemo(() => {
    if (!product?.spec) return null;
    return { ...product.spec, display_type_label: DISPLAY_TYPE_LABELS[product.spec.display_type] || product.spec.display_type };
  }, [product]);

  if (loading) return <Spinner />;
  if (!product) return <div className="container-page py-16">Product not found.</div>;

  const images = product.images?.length
    ? product.images
    : ["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&q=80"];

  const discount =
    product.original_price && product.original_price > product.price
      ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
      : 0;

  const showPrice = selectedVariant?.price ? Number(selectedVariant.price) : product.price;
  const showOriginal =
    product.original_price && Number(showPrice) < Number(product.original_price)
      ? product.original_price
      : null;

  const inCompare = compare.has?.(product.id);

  const handleAdd = async () => {
    if (!isAuth) {
      navigate("/login", { state: { from: { pathname: `/product/${slug}` } } });
      return;
    }
    try {
      await addToCart(product.id, qty);
      notify(`Added ${qty} × ${product.name} to cart`, "success");
    } catch {
      notify("Could not add to cart", "error");
    }
  };

  const handleBuyNow = async () => {
    if (!isAuth) {
      navigate("/login", { state: { from: { pathname: `/product/${slug}` } } });
      return;
    }
    try {
      await addToCart(product.id, qty);
      navigate("/checkout");
    } catch {
      notify("Could not start checkout", "error");
    }
  };

  // True if the signed-in user already has a review on this product.
  const myExistingReview = currentUserId
    ? reviews.find((r) => r.user === currentUserId || r.user?.id === currentUserId)
    : null;

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!isAuth) {
      navigate("/login", { state: { from: { pathname: `/product/${slug}` } } });
      return;
    }
    if (myRating < 1 || myRating > 5) {
      notify("Please pick a rating between 1 and 5 stars", "error");
      return;
    }
    if (!myComment.trim()) {
      notify("Please write a short comment", "error");
      return;
    }
    setSubmittingReview(true);
    try {
      const created = await productsApi.addReview(slug, {
        rating: myRating,
        title: myTitle.trim(),
        comment: myComment.trim(),
      });
      // Prepend the new review; backend also bumped product.rating_avg/review_count.
      setReviews((prev) => [created, ...prev]);
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              review_count: (prev.review_count || 0) + 1,
              rating_avg: created.rating,
            }
          : prev
      );
      setMyRating(0);
      setMyTitle("");
      setMyComment("");
      setShowReviewForm(false);
      notify("Thanks for your review!", "success");
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.rating?.[0] ||
        err?.response?.data?.comment?.[0] ||
        err?.message ||
        "Could not submit review";
      notify(detail, "error");
    } finally {
      setSubmittingReview(false);
    }
  };

  const toggleCompare = async () => {
    if (!isAuth) {
      navigate("/login");
      return;
    }
    try {
      // compareStore.toggle expects a product id, not the product object
      const result = await compare.toggle(product.id);
      notify(result?.added ? "Added to compare" : "Removed from compare", "success");
    } catch (e) {
      notify(e?.message || "Compare list full (max 4)", "error");
    }
  };

  const rating = product.rating_breakdown;

  return (
    <div className="container-page py-8">
      {/* Breadcrumb */}
      <nav className="text-label-md text-ink-muted mb-6 flex items-center gap-1 flex-wrap">
        <Link to="/" className="hover:text-primary">Home</Link>
        <Icon name="chevron_right" size={16} />
        <Link to="/catalog" className="hover:text-primary">Catalog</Link>
        <Icon name="chevron_right" size={16} />
        <Link to={`/catalog?brand=${product.brand?.slug}`} className="hover:text-primary">{product.brand?.name}</Link>
        <Icon name="chevron_right" size={16} />
        <span className="text-ink truncate">{product.name}</span>
      </nav>

      {/* Top section — gallery + buy box */}
      <div className="grid lg:grid-cols-2 gap-10">
        {/* Gallery */}
        <div>
          <div className="aspect-square bg-surface-alt rounded-md overflow-hidden card">
            <img src={images[activeImage]} alt={product.name} className="w-full h-full object-cover" />
          </div>
          {images.length > 1 && (
            <div className="flex gap-3 mt-3 overflow-x-auto no-scrollbar">
              {images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`shrink-0 w-20 h-20 rounded-sm overflow-hidden border-2 ${
                    i === activeImage ? "border-primary" : "border-transparent"
                  }`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy box */}
        <div>
          <div className="eyebrow text-primary mb-1">{product.brand?.name}</div>
          <h1 className="text-headline-lg text-ink">{product.name}</h1>
          {product.short_description && (
            <p className="text-body-md text-ink-muted mt-1">{product.short_description}</p>
          )}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1 text-accent-gold">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon key={i} name="star" filled={i < Math.round(product.rating_avg || 0)} size={18} />
              ))}
            </div>
            <span className="text-body-md text-ink-muted">
              {Number(product.rating_avg || 0).toFixed(1)} ({product.review_count || 0} reviews)
            </span>
            {product.expert_rating ? (
              <span className="chip-primary">Expert {Number(product.expert_rating).toFixed(1)}/10</span>
            ) : null}
            {product.stock > 0 ? (
              <span className="chip-primary"><Icon name="check_circle" size={16} /> In stock</span>
            ) : (
              <span className="chip bg-accent-danger/10 text-accent-danger"><Icon name="block" size={16} /> Out of stock</span>
            )}
            {product.market_status && product.market_status !== "available" && (
              <span className="chip bg-accent-warning/10 text-accent-warning">
                {MARKET_STATUS_LABELS[product.market_status] || product.market_status}
              </span>
            )}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3 mt-5">
            <span className="text-display-md text-primary font-bold">{fmt.money(showPrice)}</span>
            {showOriginal && (
              <>
                <span className="text-title-md text-ink-subtle line-through">{fmt.money(showOriginal)}</span>
                <span className="badge bg-accent-danger text-white">Save {discount}%</span>
              </>
            )}
          </div>

          {/* Variants */}
          {product.variants?.length > 0 && (
            <div className="mt-5">
              <div className="label">Storage / Variant</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {product.variants.map((v) => (
                  <button
                    key={v.label}
                    onClick={() => setSelectedVariant(v)}
                    className={`px-3 py-2 rounded-sm border text-label-md ${
                      selectedVariant?.label === v.label
                        ? "border-primary bg-primary-50 text-primary"
                        : "border-surface-border text-ink hover:border-primary"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Colors */}
          {product.colors?.length > 0 && (
            <div className="mt-5">
              <div className="label">Color · <span className="text-ink-muted">{selectedColor?.name}</span></div>
              <div className="flex flex-wrap gap-2 mt-2">
                {product.colors.map((c) => (
                  <ColorSwatch
                    key={c.name}
                    color={c}
                    selected={selectedColor?.name === c.name}
                    onClick={() => setSelectedColor(c)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Highlights */}
          {product.highlights?.length > 0 && (
            <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {product.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-body-md">
                  <Icon name="check_circle" className="text-accent-success mt-0.5" size={20} />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Quantity + actions (hidden for admin) */}
          {!isAdmin && (
            <>
              <div className="mt-7 flex items-center gap-4">
                <div className="flex items-center border border-surface-border rounded-sm overflow-hidden">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 h-11 hover:bg-surface-alt">
                    <Icon name="remove" />
                  </button>
                  <input
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-14 h-11 text-center border-x border-surface-border"
                  />
                  <button onClick={() => setQty((q) => q + 1)} className="px-3 h-11 hover:bg-surface-alt">
                    <Icon name="add" />
                  </button>
                </div>
                <button onClick={handleAdd} className="btn-primary flex-1">
                  <Icon name="shopping_cart" size={20} /> Add to cart
                </button>
                <button onClick={handleBuyNow} className="btn-gold">Buy now</button>
              </div>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={async () => {
                    if (!isAuth) return navigate("/login");
                    try {
                      await ordersApi.addWishlist(product.id);
                      notify("Added to wishlist", "success");
                    } catch {
                      notify("Could not add to wishlist", "error");
                    }
                  }}
                  className="btn-ghost flex-1 sm:flex-none"
                >
                  <Icon name="favorite_border" size={20} /> Save to wishlist
                </button>
                <button onClick={toggleCompare} className="btn-ghost flex-1 sm:flex-none">
                  <Icon name={inCompare ? "compare_arrows" : "compare"} size={20} />
                  {inCompare ? " In compare" : " Add to compare"}
                </button>
              </div>
            </>
          )}

          {/* Admin note */}
          {isAdmin && (
            <div className="mt-7 card p-4 bg-primary-50 border-primary/20">
              <div className="flex items-start gap-3">
                <Icon name="admin_panel_settings" className="text-primary" size={22} />
                <div>
                  <div className="text-title-md text-ink">Admin view</div>
                  <div className="text-body-md text-ink-muted mt-1">
                    Buying and wishlist actions are hidden for staff accounts.
                    Manage this product in <Link to="/admin/products" className="text-primary underline">Admin → Products</Link>.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Shipping & returns */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Benefit icon="local_shipping" title="Free 5-day delivery" sub="On orders over 50,000TK" />
            <Benefit icon="verified_user" title="2-year warranty" sub="Manufacturer backed" />
            <Benefit icon="undo" title="30-day returns" sub="Hassle-free policy" />
          </div>
        </div>
      </div>

      {/* Tabs — Details / Specifications / Reviews */}
      <div className="mt-12 border-b border-surface-border">
        <nav className="flex gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: "details", label: "Details", icon: "description" },
            { id: "specs", label: "Specifications", icon: "memory" },
            { id: "rating", label: "Our Rating", icon: "verified" },
            { id: "reviews", label: `Reviews (${reviews.length})`, icon: "reviews" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-label-md font-medium flex items-center gap-2 border-b-2 -mb-px transition ${
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              <Icon name={t.icon} size={18} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Details tab */}
      {activeTab === "details" && (
        <div className="grid lg:grid-cols-3 gap-6 mt-8">
          <div className="lg:col-span-2 card p-6">
            <h2 className="section-title mb-3 flex items-center gap-2">
              <Icon name="description" /> About this phone
            </h2>
            <p className="text-body-md text-ink whitespace-pre-line">{product.description}</p>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-label-md">
              <Detail label="Released" value={product.release_date ? fmt.date(product.release_date) : "—"} />
              <Detail label="Announced" value={product.announced ? fmt.date(product.announced) : "—"} />
              <Detail label="Made by" value={product.made_by || "—"} />
              <Detail label="Status" value={MARKET_STATUS_LABELS[product.market_status] || "—"} />
            </div>
          </div>

          {rating && (
            <div className="card p-6 flex flex-col items-center justify-center text-center">
              <div className="text-eyebrow text-primary">Our rating</div>
              <div className="text-display-lg text-ink font-bold mt-1">
                {Number(product.expert_rating || 0).toFixed(1)}
                <span className="text-title-md text-ink-muted font-normal"> / 10</span>
              </div>
              <p className="text-body-md text-ink-muted mt-2 line-clamp-3">{rating.verdict || "Editor's take coming soon."}</p>
              <button
                onClick={() => setActiveTab("rating")}
                className="btn-outline mt-4"
              >
                See full breakdown
              </button>
            </div>
          )}
        </div>
      )}

      {/* Specifications tab */}
      {activeTab === "specs" && spec && (
        <div className="mt-8 grid lg:grid-cols-2 gap-6">
          {SPEC_SECTIONS.map((sec) => {
            const rows = sec.rows(spec).filter(([_, v]) => v !== null && v !== undefined && v !== "");
            if (rows.length === 0) return null;
            const isOpen = openSections[sec.key];
            return (
              <div key={sec.key} className="card overflow-hidden">
                <button
                  onClick={() => setOpenSections((s) => ({ ...s, [sec.key]: !s[sec.key] }))}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-alt/50"
                >
                  <div className="flex items-center gap-2 text-title-md text-ink">
                    <Icon name={sec.icon} className="text-primary" size={20} />
                    {sec.title}
                  </div>
                  <Icon name={isOpen ? "expand_less" : "expand_more"} />
                </button>
                {isOpen && (
                  <div className="border-t border-surface-border">
                    <table className="w-full">
                      <tbody>
                        {rows.map(([label, value]) => (
                          <SpecRow key={label} label={label} value={value} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "specs" && !spec && (
        <div className="card p-8 mt-8 text-center text-ink-muted">No specifications available.</div>
      )}

      {/* Our Rating tab */}
      {activeTab === "rating" && (
        <div className="mt-8 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 card p-6 flex flex-col items-center justify-center text-center">
            <div className="text-eyebrow text-primary">Our expert rating</div>
            <ScoreRing value={product.expert_rating || 0} size={140} stroke={10} />
            <p className="text-body-md text-ink-muted mt-4 line-clamp-4">
              {rating?.verdict || "Our team is still reviewing this device."}
            </p>
          </div>
          <div className="lg:col-span-2 card p-6">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Icon name="analytics" /> Sub-ratings
            </h3>
            {rating ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                {SUB_RATINGS.map((r) => (
                  <ScoreRing key={r.key} value={rating[r.key] || 0} size={72} label={r.label} />
                ))}
              </div>
            ) : (
              <p className="text-ink-muted">No breakdown published yet.</p>
            )}
            {rating?.pros?.length > 0 && (
              <div className="mt-6">
                <div className="label text-accent-success flex items-center gap-1">
                  <Icon name="thumb_up" size={16} /> Pros
                </div>
                <ul className="mt-2 space-y-1">
                  {rating.pros.map((p, i) => (
                    <li key={i} className="text-body-md flex items-start gap-2">
                      <Icon name="add" size={16} className="text-accent-success mt-1" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rating?.cons?.length > 0 && (
              <div className="mt-6">
                <div className="label text-accent-danger flex items-center gap-1">
                  <Icon name="thumb_down" size={16} /> Cons
                </div>
                <ul className="mt-2 space-y-1">
                  {rating.cons.map((p, i) => (
                    <li key={i} className="text-body-md flex items-start gap-2">
                      <Icon name="remove" size={16} className="text-accent-danger mt-1" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reviews tab */}
      {activeTab === "reviews" && (
        <div className="mt-8">
          {/* Write / already-reviewed banner */}
          <div className="card p-5 mb-6">
            {!isAuth ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-title-md text-ink">Share your experience</div>
                  <div className="text-body-md text-ink-muted">
                    Sign in to leave a rating and a short review for this phone.
                  </div>
                </div>
                <button
                  onClick={() =>
                    navigate("/login", { state: { from: { pathname: `/product/${slug}` } } })
                  }
                  className="btn-primary inline-flex items-center gap-2 self-start sm:self-auto"
                >
                  <Icon name="login" size={18} /> Sign in to review
                </button>
              </div>
            ) : myExistingReview ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-title-md text-ink">You've already reviewed this product</div>
                  <div className="text-body-md text-ink-muted">
                    Each customer can leave one review per product. Your review is highlighted below.
                  </div>
                </div>
                <div className="flex items-center gap-1 text-accent-gold self-start sm:self-auto">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon key={i} name="star" filled={i < myExistingReview.rating} size={18} />
                  ))}
                </div>
              </div>
            ) : showReviewForm ? (
              <form onSubmit={handleSubmitReview} className="space-y-4">
                <div>
                  <div className="text-title-md text-ink mb-2">Your rating</div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const value = i + 1;
                      const active = value <= myRating;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setMyRating(value)}
                          onMouseEnter={(e) => {
                            // Hover preview: fill all stars up to the hovered one
                            const stars = e.currentTarget.parentElement.querySelectorAll("button");
                            stars.forEach((b, idx) => {
                              const star = b.querySelector("span");
                              if (star) star.style.opacity = idx < value ? "1" : "0.35";
                            });
                          }}
                          onMouseLeave={(e) => {
                            const stars = e.currentTarget.parentElement.querySelectorAll("button");
                            stars.forEach((b, idx) => {
                              const star = b.querySelector("span");
                              if (star) star.style.opacity = idx < myRating ? "1" : "0.35";
                            });
                          }}
                          aria-label={`${value} star${value === 1 ? "" : "s"}`}
                          className="p-0.5"
                        >
                          <span
                            className="inline-block transition-opacity"
                            style={{ opacity: active ? 1 : 0.35 }}
                          >
                            <Icon name="star" size={28} className="text-accent-gold" filled />
                          </span>
                        </button>
                      );
                    })}
                    <span className="ml-2 text-label-md text-ink-muted">
                      {myRating ? `${myRating} / 5` : "Tap a star"}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="review-title">Headline (optional)</label>
                  <input
                    id="review-title"
                    className="input"
                    placeholder="Loved the camera, battery could be better"
                    value={myTitle}
                    onChange={(e) => setMyTitle(e.target.value)}
                    maxLength={150}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="review-comment">Your review</label>
                  <textarea
                    id="review-comment"
                    className="input min-h-[120px]"
                    placeholder="What did you like? What could be improved?"
                    value={myComment}
                    onChange={(e) => setMyComment(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReviewForm(false);
                      setMyRating(0);
                      setMyTitle("");
                      setMyComment("");
                    }}
                    className="btn-ghost"
                    disabled={submittingReview}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={submittingReview}>
                    {submittingReview ? "Submitting…" : "Submit review"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-title-md text-ink">Share your experience</div>
                  <div className="text-body-md text-ink-muted">
                    Rate this phone and tell other buyers what you think.
                  </div>
                </div>
                <button
                  onClick={() => setShowReviewForm(true)}
                  className="btn-primary inline-flex items-center gap-2 self-start sm:self-auto"
                >
                  <Icon name="edit" size={18} /> Write a review
                </button>
              </div>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="card p-8 text-center text-ink-muted">No reviews yet — be the first to share your experience.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {reviews.map((r) => {
                const mine = currentUserId && (r.user === currentUserId || r.user?.id === currentUserId);
                return (
                  <div
                    key={r.id}
                    className={
                      "card p-5 " + (mine ? "ring-2 ring-primary border-primary" : "")
                    }
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-full bg-primary-50 text-primary flex items-center justify-center text-label-md">
                        {(r.user_name || r.user?.username || "U")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-title-md text-ink truncate">
                          {r.user_name || r.user?.username || "Customer"}
                          {mine && (
                            <span className="ml-2 badge bg-primary text-white text-label-sm align-middle">
                              Your review
                            </span>
                          )}
                        </div>
                        <div className="text-label-sm text-ink-subtle">{fmt.relative(r.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-accent-gold mb-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Icon key={i} name="star" filled={i < r.rating} size={18} />
                      ))}
                    </div>
                    {r.title && <div className="text-title-md text-ink mb-1">{r.title}</div>}
                    <div className="text-body-md text-ink">{r.comment}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* YouTube videos */}
      {videos.length > 0 && (
        <section className="mt-14">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <Icon name="play_circle" className="text-accent-danger" /> Expert video reviews
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {videos.map((v) => (
              <button
                key={v.videoId}
                onClick={() => setActiveVideo(v)}
                className="card card-hover overflow-hidden text-left"
              >
                <div className="relative aspect-video bg-ink">
                  <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-12 h-12 rounded-full bg-white/90 text-primary flex items-center justify-center">
                      <Icon name="play_arrow" size={28} filled />
                    </span>
                  </span>
                </div>
                <div className="p-3">
                  <div className="text-title-md text-ink line-clamp-2">{v.title}</div>
                  <div className="text-label-sm text-ink-muted mt-1">{v.channelName}</div>
                </div>
              </button>
            ))}
          </div>
          {activeVideo && (
            <div
              className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4"
              onClick={() => setActiveVideo(null)}
            >
              <div className="bg-white rounded-md w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-surface-border">
                  <div className="text-title-md text-ink line-clamp-1">{activeVideo.title}</div>
                  <button onClick={() => setActiveVideo(null)}><Icon name="close" /></button>
                </div>
                <div className="aspect-video bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1`}
                    title={activeVideo.title}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="card p-3">
      <div className="text-label-sm text-ink-muted uppercase tracking-wide">{label}</div>
      <div className="text-title-md text-ink mt-0.5">{value || "—"}</div>
    </div>
  );
}