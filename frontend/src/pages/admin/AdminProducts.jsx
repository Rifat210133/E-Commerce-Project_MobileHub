import { useEffect, useState, useMemo } from "react";
import { adminApi, productsApi } from "../../api";
import { fmt } from "../../lib/format";
import Spinner from "../../components/Spinner";
import EmptyState from "../../components/EmptyState";
import Modal from "../../components/Modal";
import Icon from "../../components/Icon";
import { useUIStore } from "../../stores/uiStore";

// --------------------------------------------------------------------------- //
// Form defaults + spec/score section metadata
// --------------------------------------------------------------------------- //
const EMPTY = {
  // General
  name: "",
  slug: "",
  brand_id: "",
  description: "",
  short_description: "",
  highlights: [],
  video_url: "",
  // Pricing
  price: "",
  original_price: "",
  stock: 0,
  images: [],
  // Release
  release_date: "",
  announced: "",
  market_status: "available",
  made_by: "",
  is_new_arrival: false,
  // Flags
  is_active: true,
  is_featured: false,
  expert_rating: "",
  // Variants / colors
  variants: [],
  colors: [],
  storage_options: [],
  // Nested
  spec: {},
  rating_breakdown: {},
};

const SPEC_FIELDS = [
  // Display
  { section: "Display", key: "display_type", type: "select", options: ["amoled", "ltpo_amoled", "ltps_amoled", "oled", "ips_lcd", "tft", "pls_lcd"] },
  { section: "Display", key: "display_inches", type: "number", step: "0.1", placeholder: "6.7" },
  { section: "Display", key: "display_cm", type: "number", step: "0.01", placeholder: "17.02" },
  { section: "Display", key: "resolution_width", type: "number", placeholder: "1290" },
  { section: "Display", key: "resolution_height", type: "number", placeholder: "2796" },
  { section: "Display", key: "resolution_label", type: "text", placeholder: "FHD+" },
  { section: "Display", key: "aspect_ratio", type: "text", placeholder: "19.5:9" },
  { section: "Display", key: "pixel_density_ppi", type: "number", placeholder: "460" },
  { section: "Display", key: "screen_to_body_ratio_pct", type: "number", step: "0.1", placeholder: "89.8" },
  { section: "Display", key: "brightness_peak_nits", type: "number", placeholder: "2000" },
  { section: "Display", key: "brightness_typical_nits", type: "number", placeholder: "1000" },
  { section: "Display", key: "hdr_support", type: "text", placeholder: "HDR10, Dolby Vision" },
  { section: "Display", key: "screen_protection", type: "text", placeholder: "Ceramic Shield 2" },
  { section: "Display", key: "notch_type", type: "text", placeholder: "Dynamic Island" },
  { section: "Display", key: "touch_screen", type: "text", placeholder: "Capacitive touchscreen, multi-touch" },
  { section: "Display", key: "refresh_rate_hz", type: "number", placeholder: "120" },
  { section: "Display", key: "refresh_rate_secondary_hz", type: "number", placeholder: "1" },
  { section: "Display", key: "bezel_less", type: "bool" },
  { section: "Display", key: "always_on_display", type: "bool" },

  // Hardware / Chipset
  { section: "Hardware", key: "os", type: "select", options: ["Android", "iOS"] },
  { section: "Hardware", key: "os_version", type: "text", placeholder: "iOS 17" },
  { section: "Hardware", key: "chipset", type: "text", placeholder: "Apple A17 Pro" },
  { section: "Hardware", key: "processor", type: "text", placeholder: "3.78 GHz, Hexa Core" },
  { section: "Hardware", key: "cpu_details", type: "text", placeholder: "2x3.78 GHz + 4x2.11 GHz" },
  { section: "Hardware", key: "cpu_cores", type: "number", placeholder: "6" },
  { section: "Hardware", key: "architecture", type: "text", placeholder: "64-bit" },
  { section: "Hardware", key: "fabrication_nm", type: "number", placeholder: "3" },
  { section: "Hardware", key: "gpu", type: "text", placeholder: "Apple GPU (6-core)" },

  // Memory
  { section: "Memory", key: "ram_gb", type: "number", placeholder: "8" },
  { section: "Memory", key: "ram_type", type: "text", placeholder: "LPDDR5" },
  { section: "Memory", key: "storage_gb", type: "number", placeholder: "256" },
  { section: "Memory", key: "storage_type", type: "text", placeholder: "NVMe" },
  { section: "Memory", key: "usb_otg", type: "bool" },

  // Camera — Rear
  { section: "Camera (Rear)", key: "camera_setup", type: "text", placeholder: "Triple (48 MP + 12 MP + 12 MP)" },
  { section: "Camera (Rear)", key: "camera_resolution_mp", type: "number", step: "0.1", placeholder: "48" },
  { section: "Camera (Rear)", key: "camera_resolution_detail", type: "text", placeholder: "48 MP f/1.78 (Wide)" },
  { section: "Camera (Rear)", key: "camera_aperture", type: "text", placeholder: "f/1.78" },
  { section: "Camera (Rear)", key: "camera_sensor", type: "text" },
  { section: "Camera (Rear)", key: "camera_sensor_size", type: "text", placeholder: "1/1.28\"" },
  { section: "Camera (Rear)", key: "camera_focal_length", type: "text", placeholder: "24mm" },
  { section: "Camera (Rear)", key: "camera_autofocus", type: "bool" },
  { section: "Camera (Rear)", key: "camera_ois", type: "bool" },
  { section: "Camera (Rear)", key: "camera_eis", type: "bool" },
  { section: "Camera (Rear)", key: "camera_flash", type: "text", placeholder: "Dual-LED dual-tone" },
  { section: "Camera (Rear)", key: "camera_image_resolution", type: "text", placeholder: "8000 x 6000 Pixels" },
  { section: "Camera (Rear)", key: "camera_settings", type: "text", placeholder: "Exposure compensation, ISO control" },
  { section: "Camera (Rear)", key: "camera_zoom", type: "text", placeholder: "5x optical zoom" },
  { section: "Camera (Rear)", key: "camera_shooting_modes", type: "text", placeholder: "Macro Mode, Night Mode" },
  { section: "Camera (Rear)", key: "camera_features", type: "text", placeholder: "Deep Fusion, Smart HDR 5" },
  { section: "Camera (Rear)", key: "camera_video_resolution", type: "text", placeholder: "4K @ 60fps" },
  { section: "Camera (Rear)", key: "camera_video_fps", type: "text", placeholder: "24/25/30/60/120/240 fps" },

  // Camera — Selfie
  { section: "Camera (Selfie)", key: "front_camera_setup", type: "text", placeholder: "Single" },
  { section: "Camera (Selfie)", key: "front_camera_mp", type: "number", step: "0.1", placeholder: "12" },
  { section: "Camera (Selfie)", key: "front_camera_aperture", type: "text", placeholder: "f/1.9" },
  { section: "Camera (Selfie)", key: "front_camera_autofocus", type: "bool" },
  { section: "Camera (Selfie)", key: "front_camera_flash", type: "bool" },
  { section: "Camera (Selfie)", key: "front_camera_video_resolution", type: "text", placeholder: "4K @ 60fps" },
  { section: "Camera (Selfie)", key: "front_camera_features", type: "text" },

  // Design
  { section: "Design", key: "height_mm", type: "number", step: "0.1" },
  { section: "Design", key: "width_mm", type: "number", step: "0.1" },
  { section: "Design", key: "thickness_mm", type: "number", step: "0.1" },
  { section: "Design", key: "weight_g", type: "number", step: "0.1" },
  { section: "Design", key: "build_material", type: "text", placeholder: "Titanium frame, glass back" },
  { section: "Design", key: "ip_rating", type: "text", placeholder: "IP68" },
  { section: "Design", key: "waterproof", type: "text", placeholder: "Up to 6m for 30 min" },
  { section: "Design", key: "ruggedness", type: "text", placeholder: "Dust resistant" },
  { section: "Design", key: "form_factor", type: "text", placeholder: "Touchscreen bar" },

  // Battery
  { section: "Battery", key: "battery_type", type: "text", placeholder: "Li-Ion" },
  { section: "Battery", key: "battery_mah", type: "number", placeholder: "4422" },
  { section: "Battery", key: "battery_placement", type: "text", placeholder: "Non-removable" },
  { section: "Battery", key: "charging_watts", type: "number", placeholder: "20" },
  { section: "Battery", key: "quick_charging", type: "text", placeholder: "20W wired, 50% in 30 min" },
  { section: "Battery", key: "wireless_charging", type: "text", placeholder: "15W MagSafe / Qi2" },
  { section: "Battery", key: "usb_type", type: "text", placeholder: "USB Type-C 3.2" },

  // Network
  { section: "Network", key: "has_2g", type: "bool" },
  { section: "Network", key: "has_3g", type: "bool" },
  { section: "Network", key: "has_4g", type: "bool" },
  { section: "Network", key: "has_5g", type: "bool" },
  { section: "Network", key: "network_bands", type: "text" },
  { section: "Network", key: "sim_slot", type: "text", placeholder: "Dual SIM (nano + eSIM)" },
  { section: "Network", key: "sim_size", type: "text", placeholder: "SIM1: Nano, SIM2: eSIM" },
  { section: "Network", key: "edge", type: "bool" },
  { section: "Network", key: "gprs", type: "bool" },
  { section: "Network", key: "volte", type: "bool" },
  { section: "Network", key: "network_speed", type: "text" },
  { section: "Network", key: "wlan", type: "text", placeholder: "Wi-Fi 6E (802.11 a/b/g/n/ac/ax)" },
  { section: "Network", key: "bluetooth", type: "text", placeholder: "v5.3" },
  { section: "Network", key: "gps", type: "text", placeholder: "A-GPS, GLONASS, BDS, GALILEO, QZSS" },
  { section: "Network", key: "nfc", type: "bool" },
  { section: "Network", key: "infrared", type: "bool" },
  { section: "Network", key: "wifi_hotspot", type: "bool" },

  // Sensors
  { section: "Sensors", key: "fingerprint_sensor", type: "bool" },
  { section: "Sensors", key: "fingerprint_position", type: "text", placeholder: "On-screen" },
  { section: "Sensors", key: "fingerprint_type", type: "text", placeholder: "Ultrasonic" },
  { section: "Sensors", key: "face_unlock", type: "bool" },
  { section: "Sensors", key: "sensors_list", type: "textarea", placeholder: "Accelerometer, Gyro, Proximity, Compass, Barometer" },

  // Multimedia
  { section: "Multimedia", key: "loudspeaker", type: "bool" },
  { section: "Multimedia", key: "audio_jack", type: "text", placeholder: "USB Type-C" },
  { section: "Multimedia", key: "audio_features", type: "text", placeholder: "Dolby Atmos, Spatial Audio" },
  { section: "Multimedia", key: "video_formats", type: "text", placeholder: "HEVC, H.264, ProRes" },
];

const SPEC_SECTIONS = [
  "Display", "Hardware", "Memory",
  "Camera (Rear)", "Camera (Selfie)",
  "Design", "Battery", "Network", "Sensors", "Multimedia",
];

const SCORE_FIELDS = [
  { key: "design_score", label: "Design" },
  { key: "display_score", label: "Display" },
  { key: "performance_score", label: "Performance" },
  { key: "camera_score", label: "Camera" },
  { key: "battery_score", label: "Battery" },
  { key: "software_score", label: "Software" },
  { key: "connectivity_score", label: "Connectivity" },
  { key: "value_score", label: "Value" },
];

const MARKET_OPTIONS = [
  { v: "available", label: "Available" },
  { v: "upcoming", label: "Upcoming" },
  { v: "rumored", label: "Rumored" },
  { v: "discontinued", label: "Discontinued" },
];

// --------------------------------------------------------------------------- //
// Helpers
// --------------------------------------------------------------------------- //
function prettify(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\bmah\b/i, "mAh")
    .replace(/\bmp\b/i, "MP")
    .replace(/\busb otg\b/i, "USB OTG")
    .replace(/\bnfc\b/i, "NFC")
    .replace(/\bgps\b/i, "GPS")
    .replace(/\bwlan\b/i, "WLAN")
    .replace(/\beis\b/i, "EIS")
    .replace(/\bais\b/i, "AIS")
    .replace(/\boh s\b/i, "OIS")
    .replace(/\boh s/i, "OIS")
    .replace(/\bwifi\b/i, "Wi-Fi")
    .replace(/\bbluetooth\b/i, "Bluetooth")
    .replace(/\biso\b/i, "ISO")
    .replace(/\blte\b/i, "LTE")
    .replace(/\b5g\b/i, "5G")
    .replace(/\b4g\b/i, "4G")
    .replace(/\b3g\b/i, "3G")
    .replace(/\b2g\b/i, "2G")
    .replace(/\bvolte\b/i, "VoLTE")
    .replace(/\bedge\b/i, "EDGE")
    .replace(/\bgprs\b/i, "GPRS")
    .replace(/\btype c\b/i, "Type-C")
    .replace(/\bip rating\b/i, "IP rating")
    .replace(/^./, (c) => c.toUpperCase());
}

function toBool(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function Field({ label, hint, children, className = "" }) {
  return (
    <div className={className}>
      <label className="label flex items-center gap-1">
        {label}
        {hint && <span className="text-ink-subtle text-label-sm">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Section({ icon, title, count, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.target.open)}
      className="card overflow-hidden"
    >
      <summary className="cursor-pointer px-5 py-3 flex items-center justify-between hover:bg-surface-alt/40 list-none">
        <div className="flex items-center gap-2 text-title-md text-ink">
          <Icon name={icon} className="text-primary" size={20} />
          {title}
          {count !== undefined && (
            <span className="chip-primary text-label-sm">{count}</span>
          )}
        </div>
        <Icon name={open ? "expand_less" : "expand_more"} />
      </summary>
      <div className="border-t border-surface-border px-5 py-4 bg-white">{children}</div>
    </details>
  );
}

function SpecInput({ field, value, onChange }) {
  if (field.type === "bool") {
    return (
      <label className="flex items-center gap-2 text-body-md cursor-pointer">
        <input
          type="checkbox"
          checked={toBool(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {value === true || value === false ? "" : "Yes / No"}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea className="input min-h-[70px]" value={value || ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      step={field.step}
      className="input"
      value={value ?? ""}
      placeholder={field.placeholder}
      onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
    />
  );
}

// --------------------------------------------------------------------------- //
// Page
// --------------------------------------------------------------------------- //
export default function AdminProducts() {
  const [products, setProducts] = useState(null);
  const [brands, setBrands] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const notify = useUIStore((s) => s.notify);

  const load = () =>
    adminApi.adminProducts().then((d) => setProducts(Array.isArray(d) ? d : d.results || []));

  useEffect(() => {
    load();
    productsApi.brands().then((d) => setBrands(d.results || d || []));
  }, []);

  const open = async (p) => {
    if (!p) {
      setEditing({ isNew: true });
      setForm(EMPTY);
      return;
    }
    setEditing({ ...p, isNew: false });
    setLoadingDetail(true);
    try {
      const full = await adminApi.adminProductDetail(p.id);
      setEditing(full);
      setForm(mapToForm(full));
    } catch (e) {
      notify("Could not load product details", "error");
      setForm(mapToForm(p));
    } finally {
      setLoadingDetail(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = serializeForm(form);
      if (editing.isNew) {
        await adminApi.createProduct(payload);
        notify("Product created", "success");
      } else {
        await adminApi.updateProduct(editing.id, payload);
        notify("Product updated", "success");
      }
      setEditing(null);
      await load();
    } catch (e) {
      const detail = e?.response?.data?.detail || JSON.stringify(e?.response?.data || e.message);
      notify(`Save failed: ${detail}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (!confirm(`Soft-delete "${p.name}"? It will be deactivated but kept in the catalog.`)) return;
    try {
      await adminApi.deleteProduct(p.id);
      notify("Product deactivated", "info");
      load();
    } catch {
      notify("Delete failed", "error");
    }
  };

  const filteredSpec = useMemo(() => {
    if (!form.spec) return {};
    return form.spec;
  }, [form.spec]);

  if (products === null) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow text-primary mb-1">Catalog</div>
          <h1 className="text-headline-md text-ink">Products</h1>
          <p className="text-body-md text-ink-muted mt-1">Manage your GSM-style phone catalog and editor ratings.</p>
        </div>
        <button onClick={() => open(null)} className="btn-primary"><Icon name="add" size={18} /> New product</button>
      </div>

      {!products.length ? (
        <EmptyState
          icon="smartphone"
          title="No products yet"
          message="Create your first product to get started."
          action={<button onClick={() => open(null)} className="btn-primary">Create product</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-md">
              <thead className="bg-surface-alt text-label-md text-ink-muted uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3">Brand</th>
                  <th className="text-right px-4 py-3">Price</th>
                  <th className="text-right px-4 py-3">Stock</th>
                  <th className="text-right px-4 py-3">Expert</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-alt/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-surface-alt overflow-hidden flex items-center justify-center">
                          {p.image ? <img src={p.image} className="w-full h-full object-cover" alt="" /> : <Icon name="smartphone" className="text-ink-subtle" size={18} />}
                        </div>
                        <div>
                          <div className="font-medium text-ink line-clamp-1">{p.name}</div>
                          <div className="text-label-sm text-ink-subtle">{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{p.brand_name}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{fmt.money(p.price)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`chip ${p.stock <= 5 ? "chip-danger" : p.stock <= 15 ? "chip-warning" : "chip-success"}`}>{p.stock}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-title-md text-ink">
                      {p.expert_rating ? Number(p.expert_rating).toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={`chip ${p.is_active ? "chip-success" : "chip-neutral"}`}>{p.is_active ? "Active" : "Draft"}</span>
                        {p.is_featured && <span className="chip-primary">Featured</span>}
                        {p.is_new_arrival && <span className="chip bg-primary-50 text-primary">New</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button onClick={() => open(p)} className="text-primary text-label-md font-medium hover:underline">Edit</button>
                        <button onClick={() => remove(p)} className="text-accent-danger text-label-md font-medium hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} size="xl">
        <div className="px-6 py-4 border-b border-surface-border">
          <h2 className="text-headline-md text-ink">
            {editing?.isNew ? "Create new product" : `Edit · ${editing?.name || ""}`}
          </h2>
        </div>
        {loadingDetail ? (
          <div className="p-12"><Spinner /></div>
        ) : (
          <div className="px-6 py-5 max-h-[75vh] overflow-y-auto space-y-4">
            {/* General */}
            <Section icon="info" title="General information" defaultOpen={editing?.isNew}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Name">
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Slug" hint="URL identifier">
                  <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto from name" />
                </Field>
                <Field label="Brand">
                  <select className="input" value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
                    <option value="">Select brand</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
                <Field label="Market status">
                  <select className="input" value={form.market_status} onChange={(e) => setForm({ ...form, market_status: e.target.value })}>
                    {MARKET_OPTIONS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                  </select>
                </Field>
                <Field label="Made by" hint="e.g. Apple Inc.">
                  <input className="input" value={form.made_by} onChange={(e) => setForm({ ...form, made_by: e.target.value })} />
                </Field>
                <Field label="Announced">
                  <input type="date" className="input" value={form.announced} onChange={(e) => setForm({ ...form, announced: e.target.value })} />
                </Field>
                <Field label="Release date">
                  <input type="date" className="input" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} />
                </Field>
                <Field label="Short description">
                  <input className="input" value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} />
                </Field>
                <Field label="Full description" className="md:col-span-2">
                  <textarea className="input min-h-[120px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                <Field label="Video URL" hint="YouTube embed" className="md:col-span-2">
                  <input className="input" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
                </Field>
                <Field label="Highlights" hint="one per line" className="md:col-span-2">
                  <textarea
                    className="input min-h-[80px]"
                    value={form.highlights.join("\n")}
                    onChange={(e) => setForm({ ...form, highlights: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="A19 Pro chip&#10;48 MP Fusion camera&#10;All-day battery life"
                  />
                </Field>
              </div>
            </Section>

            {/* Pricing & Stock */}
            <Section icon="payments" title="Pricing & stock">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Price (BDT)">
                  <input type="number" step="0.01" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </Field>
                <Field label="Original price" hint="strike-through">
                  <input type="number" step="0.01" className="input" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} />
                </Field>
                <Field label="Stock">
                  <input type="number" className="input" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Image URLs" hint="one per line" className="md:col-span-3">
                  <textarea
                    className="input min-h-[80px]"
                    value={form.images.join("\n")}
                    onChange={(e) => setForm({ ...form, images: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="https://..."
                  />
                </Field>
                <div className="md:col-span-3 flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-body-md cursor-pointer">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active (visible in catalog)
                  </label>
                  <label className="flex items-center gap-2 text-body-md cursor-pointer">
                    <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} /> Featured
                  </label>
                  <label className="flex items-center gap-2 text-body-md cursor-pointer">
                    <input type="checkbox" checked={form.is_new_arrival} onChange={(e) => setForm({ ...form, is_new_arrival: e.target.checked })} /> New arrival
                  </label>
                  <Field label="Expert rating (0–10)" hint="optional">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="10"
                      className="input w-32"
                      value={form.expert_rating}
                      onChange={(e) => setForm({ ...form, expert_rating: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </Section>

            {/* Variants & Colors */}
            <Section icon="tune" title="Variants & colors" count={form.variants.length + form.colors.length + form.storage_options.length}>
              <div className="space-y-5">
                <ListEditor
                  label="Variants"
                  addLabel="Add variant"
                  items={form.variants}
                  onChange={(items) => setForm({ ...form, variants: items })}
                  fields={[
                    { key: "label", label: "Label", placeholder: "256 GB · 8 GB RAM" },
                    { key: "ram_gb", label: "RAM (GB)", type: "number" },
                    { key: "storage_gb", label: "Storage (GB)", type: "number" },
                    { key: "price", label: "Price override", type: "number", step: "0.01" },
                  ]}
                  empty={{ label: "", ram_gb: "", storage_gb: "", price: "" }}
                />
                <ListEditor
                  label="Colors"
                  addLabel="Add color"
                  items={form.colors}
                  onChange={(items) => setForm({ ...form, colors: items })}
                  fields={[
                    { key: "name", label: "Name", placeholder: "Natural Titanium" },
                    { key: "hex", label: "Hex", placeholder: "#C4C2BE" },
                  ]}
                  empty={{ name: "", hex: "#888888" }}
                />
                <ListEditor
                  label="Storage options"
                  addLabel="Add storage"
                  items={form.storage_options}
                  onChange={(items) => setForm({ ...form, storage_options: items })}
                  fields={[
                    { key: "label", label: "Label", placeholder: "256 GB" },
                    { key: "gb", label: "GB", type: "number" },
                  ]}
                  empty={{ label: "", gb: "" }}
                />
              </div>
            </Section>

            {/* Specifications */}
            <Section icon="memory" title="Specifications (GSM spec sheet)">
              <div className="space-y-5">
                {SPEC_SECTIONS.map((sec) => {
                  const fields = SPEC_FIELDS.filter((f) => f.section === sec);
                  return (
                    <div key={sec}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="arrow_right" className="text-primary" size={18} />
                        <h4 className="text-title-md text-ink">{sec}</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {fields.map((f) => (
                          <Field key={f.key} label={prettify(f.key)}>
                            <SpecInput
                              field={f}
                              value={filteredSpec[f.key]}
                              onChange={(v) => setForm({ ...form, spec: { ...form.spec, [f.key]: v } })}
                            />
                          </Field>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Rating / Pros / Cons */}
            <Section icon="verified" title="Our rating & verdict">
              <div className="space-y-4">
                <div>
                  <div className="label">Sub-ratings (0–10)</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    {SCORE_FIELDS.map((s) => (
                      <Field key={s.key} label={s.label}>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          className="input"
                          value={form.rating_breakdown[s.key] ?? ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              rating_breakdown: {
                                ...form.rating_breakdown,
                                [s.key]: e.target.value === "" ? "" : Number(e.target.value),
                              },
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </div>
                <ListEditor
                  label="Pros"
                  addLabel="Add pro"
                  items={form.rating_breakdown.pros || []}
                  onChange={(items) =>
                    setForm({ ...form, rating_breakdown: { ...form.rating_breakdown, pros: items } })
                  }
                  fields={[{ key: "text", label: "Pro", placeholder: "Best-in-class performance" }]}
                  empty={{ text: "" }}
                  mode="strings"
                />
                <ListEditor
                  label="Cons"
                  addLabel="Add con"
                  items={form.rating_breakdown.cons || []}
                  onChange={(items) =>
                    setForm({ ...form, rating_breakdown: { ...form.rating_breakdown, cons: items } })
                  }
                  fields={[{ key: "text", label: "Con", placeholder: "Expensive" }]}
                  empty={{ text: "" }}
                  mode="strings"
                />
                <Field label="Verdict" hint="short editorial summary">
                  <textarea
                    className="input min-h-[100px]"
                    value={form.rating_breakdown.verdict || ""}
                    onChange={(e) =>
                      setForm({ ...form, rating_breakdown: { ...form.rating_breakdown, verdict: e.target.value } })
                    }
                    placeholder="The iPhone 15 Pro Max pushes the A17 Pro chip, a titanium build, and a 5x tetraprism telephoto into Apple's most refined flagship yet."
                  />
                </Field>
              </div>
            </Section>
          </div>
        )}
        <div className="px-6 py-4 border-t border-surface-border flex justify-between items-center bg-surface-alt/50">
          <div className="text-label-sm text-ink-muted">
            {editing?.isNew ? "New product" : `ID #${editing?.id} · ${editing?.slug}`}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(null)} className="btn-outline">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Saving…" : editing?.isNew ? "Create product" : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Reusable list editor for variants, colors, pros/cons, etc.
// --------------------------------------------------------------------------- //
function ListEditor({ label, addLabel, items, onChange, fields, empty, mode = "objects" }) {
  const add = () => {
    if (mode === "strings") onChange([...items, ""]);
    else onChange([...items, { ...empty }]);
  };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const setItem = (i, key, value) => {
    const next = items.map((it, idx) => {
      if (idx !== i) return it;
      if (mode === "strings") return value;
      return { ...it, [key]: value };
    });
    onChange(next);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="label">{label}</div>
        <button type="button" onClick={add} className="btn-outline text-label-sm">
          <Icon name="add" size={16} /> {addLabel}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-label-sm text-ink-subtle italic">No entries yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 border border-surface-border rounded-sm bg-surface-alt/30">
              {mode === "strings" ? (
                <input
                  className="input col-span-10"
                  value={it}
                  placeholder="Entry text"
                  onChange={(e) => setItem(i, null, e.target.value)}
                />
              ) : (
                fields.map((f) => (
                  <div key={f.key} className="col-span-10/12" style={{ gridColumn: `span ${Math.max(1, Math.floor(10 / fields.length))}` }}>
                    <div className="text-label-sm text-ink-muted mb-1">{f.label}</div>
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      step={f.step}
                      className="input"
                      value={it[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) =>
                        setItem(i, f.key, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
                      }
                    />
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="col-span-2 btn-ghost text-accent-danger px-2"
                title="Remove"
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Form <-> API mapping
// --------------------------------------------------------------------------- //
function mapToForm(p) {
  return {
    name: p.name || "",
    slug: p.slug || "",
    brand_id: p.brand_id ?? p.brand?.id ?? "",
    description: p.description || "",
    short_description: p.short_description || "",
    highlights: Array.isArray(p.highlights) ? p.highlights : [],
    video_url: p.video_url || "",
    price: p.price ?? "",
    original_price: p.original_price ?? "",
    stock: p.stock ?? 0,
    images: Array.isArray(p.images) ? p.images : [],
    variants: Array.isArray(p.variants) ? p.variants : [],
    colors: Array.isArray(p.colors) ? p.colors : [],
    storage_options: Array.isArray(p.storage_options) ? p.storage_options : [],
    release_date: p.release_date || "",
    announced: p.announced || "",
    market_status: p.market_status || "available",
    made_by: p.made_by || "",
    is_new_arrival: !!p.is_new_arrival,
    is_active: !!p.is_active,
    is_featured: !!p.is_featured,
    expert_rating: p.expert_rating ?? "",
    spec: p.spec && typeof p.spec === "object" ? p.spec : {},
    rating_breakdown: p.rating_breakdown && typeof p.rating_breakdown === "object"
      ? p.rating_breakdown
      : {},
  };
}

function serializeForm(f) {
  const out = {
    name: f.name,
    brand_id: Number(f.brand_id),
    description: f.description || "",
    short_description: f.short_description || "",
    highlights: f.highlights,
    video_url: f.video_url || "",
    price: Number(f.price),
    original_price: f.original_price ? Number(f.original_price) : null,
    stock: Number(f.stock) || 0,
    images: f.images,
    variants: f.variants,
    colors: f.colors,
    storage_options: f.storage_options,
    release_date: f.release_date || null,
    announced: f.announced || null,
    market_status: f.market_status || "available",
    made_by: f.made_by || "",
    is_new_arrival: !!f.is_new_arrival,
    is_active: !!f.is_active,
    is_featured: !!f.is_featured,
    expert_rating: f.expert_rating === "" ? null : Number(f.expert_rating),
  };
  if (f.slug) out.slug = f.slug;
  // Spec — only send keys with values
  const spec = {};
  for (const [k, v] of Object.entries(f.spec || {})) {
    if (v === "" || v === null || v === undefined) continue;
    spec[k] = v;
  }
  if (Object.keys(spec).length) out.spec = spec;
  // Rating — coerce sub-scores to numbers, filter empties
  const rb = {};
  for (const s of SCORE_FIELDS) {
    const v = f.rating_breakdown?.[s.key];
    if (v === "" || v === null || v === undefined) continue;
    rb[s.key] = Number(v);
  }
  if (f.rating_breakdown?.verdict) rb.verdict = f.rating_breakdown.verdict;
  if (Array.isArray(f.rating_breakdown?.pros) && f.rating_breakdown.pros.length) rb.pros = f.rating_breakdown.pros;
  if (Array.isArray(f.rating_breakdown?.cons) && f.rating_breakdown.cons.length) rb.cons = f.rating_breakdown.cons;
  if (Object.keys(rb).length) out.rating_breakdown = rb;
  return out;
}