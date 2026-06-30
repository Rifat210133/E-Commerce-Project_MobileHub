import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { useCartStore } from "../stores/cartStore";
import Icon from "../components/Icon";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const login = useAuthStore((s) => s.login);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const notify = useUIStore((s) => s.notify);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await login({ identifier, password });
      await fetchCart();
      notify(`Welcome back, ${user.first_name || user.username}!`, "success");
      // Always land on the storefront after login (or wherever the user
      // was trying to go). Admins get the same treatment — they can open
      // the admin dashboard from the navbar, not on every sign-in.
      navigate(from, { replace: true });
    } catch (err) {
      const d = err.response?.data;
      let msg = "Invalid credentials";
      if (typeof d === "string") msg = d;
      else if (d) {
        if (d.detail) msg = d.detail;
        else if (d.non_field_errors?.[0]) msg = d.non_field_errors[0];
        else {
          const first = Object.values(d).flat().find((v) => typeof v === "string");
          if (first) msg = first;
        }
      }
      notify(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary text-white flex items-center justify-center mb-4">
            <Icon name="bolt" filled size={28} />
          </div>
          <h1 className="text-headline-md text-ink">Welcome back</h1>
          <p className="text-body-md text-ink-muted mt-1">Sign in to your MobileHub account</p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email or username</label>
            <input
              autoFocus
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                className="input pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-ink-subtle hover:text-ink">
                <Icon name={show ? "visibility_off" : "visibility"} size={18} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-label-md">
            <label className="flex items-center gap-2 text-ink-muted">
              <input type="checkbox" /> Remember me
            </label>
            <Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="text-center text-label-md text-ink-muted pt-2 border-t border-surface-border">
            New to MobileHub? <Link to="/register" className="text-primary font-medium hover:underline">Create an account</Link>
          </div>
        </form>
      </div>
    </div>
  );
}