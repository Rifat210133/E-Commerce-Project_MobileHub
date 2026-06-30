import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { useCartStore } from "../stores/cartStore";
import { authApi } from "../api";
import Icon from "../components/Icon";

const RESEND_SECONDS = 60;
const OTP_LEN = 6;

function flattenApiError(d) {
  if (typeof d === "string") return d;
  if (!d) return "Something went wrong.";
  const lines = [];
  for (const [k, v] of Object.entries(d)) {
    const text = Array.isArray(v) ? v.join(", ") : String(v);
    if (k === "detail" || k === "non_field_errors") lines.push(text);
    else lines.push(`${k}: ${text}`);
  }
  return lines.length ? lines.join(" • ") : "Something went wrong.";
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    password_confirm: "",
    agree: false,
  });
  const [show, setShow] = useState(false);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState(Array(OTP_LEN).fill(""));
  const [otpError, setOtpError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRefs = useRef([]);

  const register = useAuthStore((s) => s.register);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const notify = useUIStore((s) => s.notify);
  const navigate = useNavigate();

  const update = (k) => (e) => {
    const v = k === "agree" ? e.target.checked : e.target.value;
    setForm((s) => ({ ...s, [k]: v }));
  };

  const sendCode = async (e) => {
    e?.preventDefault?.();
    if (sending) return;
    if (!form.username || !form.email || !form.password) {
      notify("Fill in username, email, and password first.", "error");
      return;
    }
    if (form.password !== form.password_confirm) {
      notify("Passwords don't match.", "error");
      return;
    }
    if (!form.agree) {
      notify("Please agree to the Terms and Privacy Policy.", "error");
      return;
    }
    setSending(true);
    try {
      const res = await authApi.requestRegisterOtp(form.email);
      if (res?.code) {
        console.info("[Register] OTP code (DEBUG):", res.code);
      }
      if (res?.debug_error) {
        console.warn("[Register] Email backend warning:", res.debug_error);
        notify(
          "We couldn't send the email — showing the code in console only.",
          "warning"
        );
      }
      notify(`Verification code sent to ${form.email}.`, "success");
      setStep(2);
      setCooldown(RESEND_SECONDS);
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch (err) {
      const d = err.response?.data;
      if (err.response?.status === 429) {
        notify("Too many code requests. Please wait a few minutes.", "error");
      } else {
        notify(flattenApiError(d), "error");
      }
    } finally {
      setSending(false);
    }
  };

  const verifyAndRegister = async (e) => {
    e?.preventDefault?.();
    if (verifying) return;
    const code = otp.join("");
    if (code.length !== OTP_LEN) {
      setOtpError("Enter all 6 digits.");
      return;
    }
    setVerifying(true);
    setOtpError(null);
    try {
      const user = await register({
        username: form.username,
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        password: form.password,
        password_confirm: form.password_confirm,
        otp_code: code,
      });
      await fetchCart();
      notify(`Welcome, ${user.first_name || user.username}!`, "success");
      navigate("/", { replace: true });
    } catch (err) {
      const d = err.response?.data;
      const msg = flattenApiError(d);
      if (/code|otp/i.test(msg)) {
        setOtpError(msg);
      } else {
        notify(msg, "error");
      }
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const resend = async () => {
    if (cooldown > 0) return;
    setSending(true);
    try {
      const res = await authApi.requestRegisterOtp(form.email);
      if (res?.code) console.info("[Register] OTP code (DEBUG):", res.code);
      notify(`New code sent to ${form.email}.`, "success");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      if (err.response?.status === 429) {
        notify("Too many code requests. Please wait a few minutes.", "error");
      } else {
        notify(flattenApiError(err.response?.data), "error");
      }
    } finally {
      setSending(false);
    }
  };

  const setDigit = (i, ch) => {
    if (!/^\d?$/.test(ch)) return;
    setOtp((arr) => {
      const next = [...arr];
      next[i] = ch;
      return next;
    });
    if (ch && i < OTP_LEN - 1) otpRefs.current[i + 1]?.focus();
  };
  const onKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      otpRefs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < OTP_LEN - 1) {
      otpRefs.current[i + 1]?.focus();
    }
  };
  const onPaste = (e) => {
    const text = (e.clipboardData.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, OTP_LEN);
    if (!text) return;
    e.preventDefault();
    const next = Array(OTP_LEN).fill("");
    for (let i = 0; i < OTP_LEN; i += 1) next[i] = text[i] || "";
    setOtp(next);
    const firstEmpty = next.findIndex((c) => !c);
    const focusAt = firstEmpty === -1 ? OTP_LEN - 1 : firstEmpty;
    otpRefs.current[focusAt]?.focus();
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary text-white flex items-center justify-center mb-4">
            <Icon name={step === 1 ? "person_add" : "mark_email_read"} size={28} />
          </div>
          <h1 className="text-headline-md text-ink">
            {step === 1 ? "Create your account" : "Verify your email"}
          </h1>
          <p className="text-body-md text-ink-muted mt-1">
            {step === 1
              ? "Join MobileHub for faster checkout and exclusive deals"
              : `We sent a 6-digit code to ${form.email}. Enter it below to finish creating your account.`}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={sendCode} className="card p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">First name</label>
                <input
                  className="input"
                  value={form.first_name}
                  onChange={update("first_name")}
                />
              </div>
              <div>
                <label className="label">Last name</label>
                <input
                  className="input"
                  value={form.last_name}
                  onChange={update("last_name")}
                />
              </div>
            </div>
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                value={form.username}
                onChange={update("username")}
                required
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={update("email")}
                required
              />
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
              <label className="label">Confirm password</label>
              <input
                type={show ? "text" : "password"}
                className="input"
                value={form.password_confirm}
                onChange={update("password_confirm")}
                required
                minLength={8}
              />
            </div>
            <label className="flex items-start gap-2 text-body-sm text-ink-muted">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.agree}
                onChange={update("agree")}
                required
              />
              <span>
                I agree to the{" "}
                <Link to="/terms" target="_blank" className="text-primary hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" target="_blank" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            <button
              type="submit"
              disabled={sending}
              className="btn-primary w-full disabled:opacity-60"
            >
              {sending ? "Sending code…" : "Send verification code"}
            </button>
            <div className="text-center text-label-md text-ink-muted pt-2 border-t border-surface-border">
              Already have an account?{" "}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={verifyAndRegister} className="card p-6 space-y-5">
            <div>
              <label className="label">Verification code</label>
              <div
                className="flex justify-between gap-2"
                onPaste={onPaste}
              >
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={1}
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    aria-label={`Digit ${i + 1}`}
                    className={`w-12 h-14 text-center text-title-lg font-bold rounded-lg border outline-none transition focus:ring-2 focus:ring-primary/40 ${
                      otpError
                        ? "border-red-400 bg-red-50"
                        : "border-surface-border bg-surface-white"
                    }`}
                  />
                ))}
              </div>
              {otpError && (
                <p className="text-label-sm text-red-600 mt-2">{otpError}</p>
              )}
              <p className="text-label-sm text-ink-subtle mt-2">
                The code expires in 10 minutes.
              </p>
            </div>

            <button
              type="submit"
              disabled={verifying || otp.join("").length !== OTP_LEN}
              className="btn-primary w-full disabled:opacity-60"
            >
              {verifying ? "Creating account…" : "Verify & create account"}
            </button>

            <div className="flex items-center justify-between text-label-md">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setOtp(Array(OTP_LEN).fill(""));
                  setOtpError(null);
                }}
                className="text-ink-muted hover:text-ink inline-flex items-center gap-1"
              >
                <Icon name="arrow_back" size={16} /> Change email
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0 || sending}
                className="text-primary hover:underline disabled:opacity-60 disabled:no-underline"
              >
                {sending
                  ? "Sending…"
                  : cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}