import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import Icon from "../../components/Icon";
import Spinner from "../../components/Spinner";

export default function AdminProfile() {
  const { user, fetchMe, updateProfile } = useAuthStore();

  const [form, setForm] = useState(null);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!user) fetchMe();
  }, [user, fetchMe]);

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
        postal_code: user.profile?.postal_code || "",
        country: user.profile?.country || "Bangladesh",
      });
    }
  }, [user]);

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
              value={
                user.date_joined
                  ? new Date(user.date_joined).toLocaleDateString()
                  : "—"
              }
              icon="event"
            />
            {form.phone_number ? (
              <Row label="Phone" value={form.phone_number} icon="phone" />
            ) : null}
            {form.address_line1 ? (
              <Row
                label="Address"
                value={[form.address_line1, form.city, form.state, form.postal_code, form.country]
                  .filter(Boolean)
                  .join(", ")}
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
                  disabled={savingProfile}
                />
              </div>
              <div className="sm:col-span-3">
                <label className="text-label-md text-ink block mb-2">City</label>
                <input
                  className="input w-full"
                  value={form.city}
                  onChange={update("city")}
                  disabled={savingProfile}
                />
              </div>
              <div className="sm:col-span-1">
                <label className="text-label-md text-ink block mb-2">State</label>
                <input
                  className="input w-full"
                  value={form.state}
                  onChange={update("state")}
                  disabled={savingProfile}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-label-md text-ink block mb-2">Postal code</label>
                <input
                  className="input w-full"
                  value={form.postal_code}
                  onChange={update("postal_code")}
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