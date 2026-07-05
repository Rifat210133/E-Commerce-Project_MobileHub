import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { useCartStore } from "../stores/cartStore";
import Icon from "../components/Icon";

export default function LoginPage() {
  // The register page sends users here with the email prefilled
  // (?email=...) when their address is already registered — keeps the
  // recovery path to a single click.
  const [searchParams] = useSearchParams();
  const prefilledEmail = searchParams.get("email") || "";
  const [identifier, setIdentifier] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  // Friendly pre-flight state — set by `checkIdentifier` *before* we
  // burn a real login attempt. We only set this when the server tells
  // us the account is missing or unusable (no password set), so the
  // form stays exactly as it was for the common "valid identifier,
  // wrong password" path (which still surfaces "Invalid credentials.").
  const [identifierStatus, setIdentifierStatus] = useState(null); // { kind: "missing" | "social-only", identifier }
  const login = useAuthStore((s) => s.login);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const notify = useUIStore((s) => s.notify);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) return;
    setBusy(true);
    // Pre-flight probe — distinguishes "no such account" from "wrong
    // password" so the user gets actionable guidance instead of a
    // misleading generic 401. If the probe fails for any reason (network
    // error, throttle, etc.) we fall through to the real login attempt
    // and let the existing 401 path handle it.
    try {
      const probe = await authApi.checkIdentifier(trimmed);
      if (probe && probe.exists === false) {
        setIdentifierStatus({ kind: "missing", identifier: probe.identifier || trimmed });
        setBusy(false);
        return;
      }
      if (probe && probe.exists && probe.can_password_login === false) {
        setIdentifierStatus({
          kind: "social-only",
          identifier: probe.identifier || trimmed,
        });
        setBusy(false);
        return;
      }
    } catch {
      // Probe failed — fall through to the real login attempt below.
    }
    try {
      const user = await login({ identifier: trimmed, password });
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
              onChange={(e) => {
                setIdentifier(e.target.value);
                // User is editing — the previous probe result is no
                // longer trustworthy; clear it so the inline banner
                // disappears and they get a fresh attempt on submit.
                if (identifierStatus) setIdentifierStatus(null);
              }}
              placeholder="you@example.com"
              required
            />
          </div>
          {identifierStatus?.kind === "missing" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-body-sm text-error"
            >
              <Icon name="person_off" size={18} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p>
                  No account found for{" "}
                  <strong>{identifierStatus.identifier}</strong>.
                </p>
                <p className="mt-1">
                  Want to create one?{" "}
                  <Link
                    to="/register"
                    state={{ email: identifierStatus.identifier }}
                    className="font-medium underline"
                  >
                    Register here
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}
          {identifierStatus?.kind === "social-only" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-body-sm text-ink"
            >
              <Icon name="vpn_key_off" size={18} className="mt-0.5 shrink-0 text-warning" />
              <div className="flex-1">
                <p>
                  <strong>{identifierStatus.identifier}</strong> is registered but
                  doesn't have a password set — it can only be signed in to with the
                  original method used to create it.
                </p>
                <p className="mt-1">
                  Need help getting back in?{" "}
                  <Link to="/forgot-password" className="font-medium underline">
                    Reset password
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}
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