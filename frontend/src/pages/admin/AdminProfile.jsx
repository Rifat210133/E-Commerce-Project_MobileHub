import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import api from "../../api/client";
import Icon from "../../components/Icon";
import Spinner from "../../components/Spinner";

export default function AdminProfile() {
  const { user, fetchMe, updateProfile } = useAuthStore();

  const [form, setForm] = useState(null);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [toast, setToast] = useState(null);
  const [divisions, setDivisions] = useState([]);

  useEffect(() => {
    if (!user) fetchMe();
  }, [user, fetchMe]);

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
      });
    }
  }, [user]);

  // Derive district / upazila options for the cascading admin-area
  // dropdowns. Same shape as ProfilePage so users see consistent data.
  const districtsForDivision = useMemo(() => {
    if (!form?.division) return [];
    return divisions.find((d) => d.name === form.division)?.districts || [];
  }, [divisions, form?.division]);

  const upazilasForDistrict = useMemo(() => {
    if (!form?.district) return [];
    return districtsForDivision.find((d) => d.name === form.district)?.upazilas || [];
  }, [districtsForDivision, form?.district]);

  const onDivisionChange = (e) =>
    setForm((f) => ({ ...f, division: e.target.value, district: "", upazila: "" }));
  const onDistrictChange = (e) =>
    setForm((f) => ({ ...f, district: e.target.value, upazila: "" }));
  const onUpazilaChange = (e) =>
    setForm((f) => ({ ...f, upazila: e.target.value }));

  const showToast = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const updatePw = (k) => (e) => setPasswords({ ...passwords, [k]: e.target.value });

  const errToString = (err) =>
    err?.response?.data?.detail ||
    (typeof err?.response?.data === "object" && err?.response?.data
      ? Object.entries(err.response.data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("; ")
      : null) ||
    err?.message ||
    "Request failed";

  const onSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile(form);
      await fetchMe();
      showToast("Profile updated.", "success");
    } catch (err) {
      showToast(errToString(err), "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async (e) => {
    e.preventDefault();
    if (!passwords.current || !passwords.next) {
      showToast("Fill in current and new password.", "error");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      showToast("New password and confirmation do not match.", "error");
      return;
    }
    setSavingPassword(true);
    try {
      const { authApi } = await import("../../api");
      await authApi.changePassword({
        current_password: passwords.current,
        new_password: passwords.next,
      });
      setPasswords({ current: "", next: "", confirm: "" });
      showToast("Password changed.", "success");
    } catch (err) {
      showToast(errToString(err), "error");
    } finally {
      setSavingPassword(false);
    }
  };

  if (!form) return <Spinner />;

  const initials =
    (user.first_name?.[0] || user.username?.[0] || "A").toUpperCase();

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow text-primary mb-1">Account</div>
          <h1 className="text-headline-md font-headline-md">Admin profile</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Manage your personal information and password.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: identity card */}
        <aside className="lg:col-span-1 bg-white border border-surface-border rounded-2xl p-6 h-fit">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-display-md font-semibold">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-title-md text-ink truncate">
                {user.first_name || user.username}
              </div>
              <div className="text-label-md text-ink-muted truncate">@{user.username}</div>
            </div>
          </div>

          <dl className="mt-5 space-y-3 text-body-md">
            <Row label="Email" value={user.email} icon="email" />
            <Row
              label="Role"
              value={user.role || (user.is_admin ? "Admin" : "Staff")}
              icon="shield_person"
            />
            <Row
              label="Member since"
              value={formatJoinDate(user.joined_at || user.date_joined)}
              icon="event"
            />
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

        {/* Right: edit forms */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={onSaveProfile} className="bg-white border border-surface-border rounded-2xl p-6 space-y-5">
            <h2 className="text-title-md text-ink">Personal information</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-label-md text-ink block mb-2">First name</label>
                <input
                  className="input w-full"
                  value={form.first_name}
                  onChange={update("first_name")}
                  disabled={savingProfile}
                />
              </div>
              <div>
                <label className="text-label-md text-ink block mb-2">Last name</label>
                <input
                  className="input w-full"
                  value={form.last_name}
                  onChange={update("last_name")}
                  disabled={savingProfile}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-label-md text-ink block mb-2">Email</label>
                <input
                  type="email"
                  className="input w-full"
                  value={form.email}
                  onChange={update("email")}
                  required
                  disabled={savingProfile}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-label-md text-ink block mb-2">Phone</label>
                <input
                  className="input w-full"
                  value={form.phone_number}
                  onChange={update("phone_number")}
                  placeholder="+1 555 123 4567"
                  disabled={savingProfile}
                />
              </div>
            </div>

            <h2 className="text-title-md text-ink pt-2">Default address</h2>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div className="sm:col-span-6">
                <label className="text-label-md text-ink block mb-2">Address line 1</label>
                <input
                  className="input w-full"
                  value={form.address_line1}
                  onChange={update("address_line1")}
                  placeholder="House / road / area"
                  disabled={savingProfile}
                />
              </div>

              {/* Bangladesh admin areas: Division → District → Upazila, as
                  cascading selects. Country is fixed to Bangladesh here. */}
              <div className="sm:col-span-2">
                <label className="text-label-md text-ink block mb-2">Division</label>
                <select
                  className="input w-full"
                  value={form.division}
                  onChange={onDivisionChange}
                  disabled={savingProfile}
                >
                  <option value="">Select division</option>
                  {divisions.map((d) => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-label-md text-ink block mb-2">District</label>
                <select
                  className="input w-full"
                  value={form.district}
                  onChange={onDistrictChange}
                  disabled={savingProfile || !form.division || districtsForDivision.length === 0}
                >
                  <option value="">{form.division ? "Select district" : "Pick a division first"}</option>
                  {districtsForDivision.map((d) => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-label-md text-ink block mb-2">Upazila</label>
                <select
                  className="input w-full"
                  value={form.upazila}
                  onChange={onUpazilaChange}
                  disabled={savingProfile || !form.district || upazilasForDistrict.length === 0}
                >
                  <option value="">{form.district ? "Select upazila" : "Pick a district first"}</option>
                  {upazilasForDistrict.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="text-label-md text-ink block mb-2">Area / village (optional)</label>
                <input
                  className="input w-full"
                  value={form.city}
                  onChange={update("city")}
                  placeholder="e.g. Bashundhara R/A, Mohammadpur"
                  disabled={savingProfile}
                />
              </div>
              <div className="sm:col-span-3">
                <label className="text-label-md text-ink block mb-2">Postal code</label>
                <input
                  className="input w-full"
                  value={form.postal_code}
                  onChange={update("postal_code")}
                  placeholder="1212"
                  disabled={savingProfile}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-surface-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-outline"
                disabled={savingProfile}
              >
                Discard
              </button>
              <button
                type="submit"
                className="btn-primary disabled:opacity-60"
                disabled={savingProfile}
              >
                <Icon name="save" size={18} />
                {savingProfile ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>

          <form
            onSubmit={onChangePassword}
            className="bg-white border border-surface-border rounded-2xl p-6 space-y-5"
          >
            <h2 className="text-title-md text-ink">Change password</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-label-md text-ink block mb-2">Current password</label>
                <input
                  type="password"
                  className="input w-full"
                  value={passwords.current}
                  onChange={updatePw("current")}
                  disabled={savingPassword}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="text-label-md text-ink block mb-2">New password</label>
                <input
                  type="password"
                  className="input w-full"
                  value={passwords.next}
                  onChange={updatePw("next")}
                  disabled={savingPassword}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="text-label-md text-ink block mb-2">Confirm new password</label>
                <input
                  type="password"
                  className="input w-full"
                  value={passwords.confirm}
                  onChange={updatePw("confirm")}
                  disabled={savingPassword}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-surface-border flex justify-end">
              <button
                type="submit"
                className="btn-primary disabled:opacity-60"
                disabled={savingPassword}
              >
                <Icon name="lock_reset" size={18} />
                {savingPassword ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>

          {toast && (
            <div
              className={`px-4 py-3 rounded-md text-label-md ${
                toast.kind === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {toast.msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, icon }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted flex items-center gap-2 min-w-0">
        <Icon name={icon} size={16} className="text-ink-subtle" />
        {label}
      </span>
      <span className="text-ink font-medium text-right truncate">{value}</span>
    </div>
  );
}

function hasAddress(f) {
  return Boolean(
    f.address_line1 || f.city || f.state || f.division ||
    f.district || f.upazila || f.postal_code || f.country
  );
}

function formatJoinDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

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
}