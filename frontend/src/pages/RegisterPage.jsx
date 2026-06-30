import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { useCartStore } from "../stores/cartStore";
import Icon from "../components/Icon";

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "", email: "", password: "", password_confirm: "",
    first_name: "", last_name: "",
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const register = useAuthStore((s) => s.register);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const notify = useUIStore((s) => s.notify);
  const navigate = useNavigate();

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await register({ ...form, password_confirm: form.password });
      await fetchCart();
      notify(`Welcome, ${user.first_name || user.username}!`, "success");
      navigate("/", { replace: true });
    } catch (err) {
      const d = err.response?.data;
      let msg = "Registration failed";
      if (typeof d === "string") msg = d;
      else if (d) {
        // Flatten DRF field errors like {username: ["A user with that username already exists."]}
        const lines = [];
        for (const [k, v] of Object.entries(d)) {
          const text = Array.isArray(v) ? v.join(", ") : String(v);
          if (k === "detail" || k === "non_field_errors") lines.push(text);
          else lines.push(`${k}: ${text}`);
        }
        if (lines.length) msg = lines.join(" • ");
      }
      notify(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary text-white flex items-center justify-center mb-4">
            <Icon name="person_add" size={28} />
          </div>
          <h1 className="text-headline-md text-ink">Create your account</h1>
          <p className="text-body-md text-ink-muted mt-1">Join MobileHub for faster checkout and exclusive deals</p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">First name</label>
              <input className="input" value={form.first_name} onChange={update("first_name")} />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="input" value={form.last_name} onChange={update("last_name")} />
            </div>
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={form.username} onChange={update("username")} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={update("email")} required />
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                className="input pr-10"
                value={form.password}
                onChange={update("password")}
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-ink-subtle hover:text-ink">
                <Icon name={show ? "visibility_off" : "visibility"} size={18} />
              </button>
            </div>
          </div>
          <label className="flex items-start gap-2 text-body-sm text-ink-muted">
            <input type="checkbox" className="mt-1" required />
            <span>I agree to the <Link to="/terms" target="_blank" className="text-primary hover:underline">Terms</Link> and <Link to="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>.</span>
          </label>
          <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy ? "Creating account…" : "Create account"}
          </button>
          <div className="text-center text-label-md text-ink-muted pt-2 border-t border-surface-border">
            Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}