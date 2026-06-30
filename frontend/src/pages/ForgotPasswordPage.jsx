import { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api";
import { useUIStore } from "../stores/uiStore";
import Icon from "../components/Icon";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const notify = useUIStore((s) => s.notify);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // The backend returns 200 with a possible `debug_error` field when an
      // SMTP send fails in DEBUG mode. Auth API helper currently throws on
      // non-2xx only, so this captures the soft-failure case too.
      const resp = await authApi.requestPasswordReset(email.trim());
      if (resp?.debug_error) notify(resp.debug_error, "error");
      setSent(true);
    } catch (err) {
      const d = err.response?.data;
      const msg =
        (d && (d.detail || d.email?.[0])) ||
        "We couldn't process that email. Check the address and try again.";
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
            <Icon name="lock_reset" size={28} />
          </div>
          <h1 className="text-headline-md text-ink">Forgot your password?</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Enter the email on your account and we'll send you a reset link.
          </p>
        </div>

        <div className="card p-6 space-y-4">
          {sent ? (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Icon name="mark_email_read" size={24} />
              </div>
              <h2 className="text-title-md text-ink">Check your inbox</h2>
              <p className="text-body-sm text-ink-muted">
                If an account exists for <strong>{email}</strong>, we've sent a
                password-reset link. It expires in 24 hours.
              </p>
              <Link to="/login" className="btn-primary inline-flex mt-2">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input
                  autoFocus
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full disabled:opacity-60"
              >
                {busy ? "Sending link…" : "Send reset link"}
              </button>
              <div className="text-center text-label-md text-ink-muted">
                Remembered it?{" "}
                <Link to="/login" className="text-primary font-medium hover:underline">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
