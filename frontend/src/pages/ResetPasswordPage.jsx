import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authApi } from "../api";
import { useUIStore } from "../stores/uiStore";
import Icon from "../components/Icon";

export default function ResetPasswordPage() {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const notify = useUIStore((s) => s.notify);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      notify("Passwords don't match", "error");
      return;
    }
    if (password.length < 8) {
      notify("Use at least 8 characters", "error");
      return;
    }
    setBusy(true);
    try {
      await authApi.confirmPasswordReset({
        uid,
        token,
        new_password: password,
        new_password_confirm: confirm,
      });
      setDone(true);
      notify("Password updated — you can now sign in", "success");
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err) {
      const d = err.response?.data;
      let msg = "We couldn't update your password.";
      if (d?.detail) msg = d.detail;
      else if (d?.new_password?.[0]) msg = d.new_password[0];
      else if (d?.new_password_confirm?.[0]) msg = d.new_password_confirm[0];
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
            <Icon name="lock" size={28} />
          </div>
          <h1 className="text-headline-md text-ink">Set a new password</h1>
          <p className="text-body-md text-ink-muted mt-1">
            Choose something strong — at least 8 characters.
          </p>
        </div>

        <div className="card p-6 space-y-4">
          {done ? (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Icon name="check_circle" size={24} />
              </div>
              <h2 className="text-title-md text-ink">All set</h2>
              <p className="text-body-sm text-ink-muted">
                Your password has been updated. Redirecting you to sign in…
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">New password</label>
                <div className="relative">
                  <input
                    autoFocus
                    type={show ? "text" : "password"}
                    className="input pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-ink-subtle hover:text-ink"
                  >
                    <Icon name={show ? "visibility_off" : "visibility"} size={18} />
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <input
                  type={show ? "text" : "password"}
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full disabled:opacity-60"
              >
                {busy ? "Updating…" : "Update password"}
              </button>
              <div className="text-center text-label-md text-ink-muted">
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
