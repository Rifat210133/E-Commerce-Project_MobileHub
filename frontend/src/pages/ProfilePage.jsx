import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import api from "../api/client";
import Icon from "../components/Icon";

const TIER_BADGE = {
  standard: "chip-neutral",
  gold: "chip-warning",
  platinum: "chip-info",
  elite: "chip-warning",
};

const tierKey = (t) => (t || "standard").toLowerCase();

export default function ProfilePage() {
  const { user, fetchMe, updateProfile } = useAuthStore();
  const notify = useUIStore((s) => s.notify);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  // Bangladesh admin-area cascading data: Division → District → Upazila.
  // Fetched once on mount; harmless to re-fetch if it fails.
  const [divisions, setDivisions] = useState([]);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  useEffect(() => {
    api.get("/auth/bd-geo/")
      .then((r) => setDivisions(r.data?.divisions || []))
      .catch(() => setDivisions([]));
  }, []);

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email: user.email || "",
        phone_number: user.profile?.phone_number || "",
        address_line1: user.profile?.address_line1 || "",
        city: user.profile?.city || "",
        state: user.profile?.state || "",
        division: user.profile?.division || "",
        district: user.profile?.district || "",
        upazila: user.profile?.upazila || "",
        postal_code: user.profile?.postal_code || "",
        country: user.profile?.country || "Bangladesh",
        membership_tier: user.profile?.membership_tier || "Standard",
      });
    }
  }, [user]);

  // Derive the available districts and upazilas from the picked division /
  // district. We tolerate stale values (e.g. a user whose saved district
  // isn't in the new division) by leaving the options empty and forcing a
  // re-pick — the form's validation will re-enable the dependent dropdowns.
  const districtsForDivision = useMemo(() => {
    if (!form?.division) return [];
    return divisions.find((d) => d.name === form.division)?.districts || [];
  }, [divisions, form?.division]);

  const upazilasForDistrict = useMemo(() => {
    if (!form?.district) return [];
    return districtsForDivision.find((d) => d.name === form.district)?.upazilas || [];
  }, [districtsForDivision, form?.district]);

  // Reset dependent selections when the parent changes — saves the user
  // from saving an inconsistent (division, district, upazila) tuple.
  const onDivisionChange = (e) => {
    const v = e.target.value;
    setForm((f) => ({
      ...f,
      division: v,
      district: "",
      upazila: "",
    }));
  };
  const onDistrictChange = (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, district: v, upazila: "" }));
  };
  const onUpazilaChange = (e) => {
    setForm((f) => ({ ...f, upazila: e.target.value }));
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile(form);
      notify("Profile updated", "success");
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        (typeof err?.response?.data === "object" && err?.response?.data
          ? Object.entries(err.response.data)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .join("; ")
          : null) ||
        err?.message ||
        "Could not save profile";
      notify(detail, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <div className="container-page py-12 text-center text-ink-muted">Loading…</div>;

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <div className="eyebrow text-primary mb-1">Account</div>
        <h1 className="text-headline-lg text-ink">My profile</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="card p-5 h-fit">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-display-md font-semibold">
              {(user.first_name?.[0] || user.username?.[0] || "U").toUpperCase()}
            </div>
            <div>
              <div className="text-title-md text-ink">{user.first_name || user.username}</div>
              <div className="text-label-md text-ink-muted">@{user.username}</div>
            </div>
          </div>
          <dl className="mt-5 space-y-3 text-body-md">
            <Row label="Email" value={user.email} icon="email" />
            <Row label="Member since" value={formatJoinDate(user.joined_at || user.date_joined)} icon="event" />
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Tier</span>
              <span className={`chip ${TIER_BADGE[tierKey(form.membership_tier)] || "chip-neutral"} capitalize`}>
                {form.membership_tier}
              </span>
            </div>
            {form.phone_number ? (
              <Row label="Phone" value={form.phone_number} icon="phone" />
            ) : null}
            {hasAddress(form) ? (
              <Row
                label="Address"
                value={formatAddressSummary(form)}
                icon="home"
              />
            ) : null}
          </dl>
        </aside>

        <form onSubmit={submit} className="lg:col-span-2 card p-6 space-y-5">
          <h2 className="text-title-md text-ink">Personal information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">First name</label>
              <input className="input" value={form.first_name} onChange={update("first_name")} />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="input" value={form.last_name} onChange={update("last_name")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={update("email")} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Phone</label>
              <input className="input" value={form.phone_number} onChange={update("phone_number")} placeholder="+1 555 123 4567" />
            </div>
          </div>

          <h2 className="text-title-md text-ink pt-2">Default address</h2>
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="sm:col-span-6">
              <label className="label">Address line 1</label>
              <input
                className="input"
                value={form.address_line1}
                onChange={update("address_line1")}
                placeholder="House / road / area"
              />
            </div>

            {/* Bangladesh: Division → District → Upazila. Country is fixed
                to "Bangladesh" for this form since that's the only dataset
                we currently ship — a future international form can branch
                off this. */}
            <div className="sm:col-span-2">
              <label className="label">Division</label>
              <select
                className="input"
                value={form.division}
                onChange={onDivisionChange}
              >
                <option value="">Select division</option>
                {divisions.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="label">District</label>
              <select
                className="input"
                value={form.district}
                onChange={onDistrictChange}
                disabled={!form.division || districtsForDivision.length === 0}
              >
                <option value="">{form.division ? "Select district" : "Pick a division first"}</option>
                {districtsForDivision.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="label">Upazila</label>
              <select
                className="input"
                value={form.upazila}
                onChange={onUpazilaChange}
                disabled={!form.district || upazilasForDistrict.length === 0}
              >
                <option value="">{form.district ? "Select upazila" : "Pick a district first"}</option>
                {upazilasForDistrict.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="label">Area / village (optional)</label>
              <input
                className="input"
                value={form.city}
                onChange={update("city")}
                placeholder="e.g. Bashundhara R/A, Mohammadpur"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="label">Postal code</label>
              <input
                className="input"
                value={form.postal_code}
                onChange={update("postal_code")}
                placeholder="1212"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-surface-border flex justify-end gap-2">
            <button type="button" onClick={() => window.location.reload()} className="btn-outline">Discard</button>
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// `hasAddress` is true when *any* of the address fields are populated —
// used to hide the summary row in the side card when there's nothing to
// show, instead of printing an awkward trailing comma.
function hasAddress(f) {
  return Boolean(
    f.address_line1 || f.city || f.state || f.division ||
    f.district || f.upazila || f.postal_code || f.country
  );
}

// Render the "Member since" date from the backend's `joined_at` (or
// `date_joined` fallback) without ever printing "Invalid Date". Returns
// `—` if both fields are missing or the string is unparseable.
function formatJoinDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

// Compose a single-line summary for the side card. Order: street, area,
// upazila, district, division, postal, country — matches how Bangladeshi
// addresses are usually written top-down.
function formatAddressSummary(f) {
  return [
    f.address_line1,
    f.city,
    f.upazila,
    f.district,
    f.division,
    f.postal_code,
    f.country,
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(", ");
}

function Row({ label, value, icon }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted flex items-center gap-2"><Icon name={icon} size={16} className="text-ink-subtle" />{label}</span>
      <span className="text-ink font-medium text-right truncate">{value}</span>
    </div>
  );
}