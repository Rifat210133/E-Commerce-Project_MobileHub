import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { policiesApi } from "../api";
import Spinner from "../components/Spinner";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function MetadataChips({ policy }) {
  const chips = [];
  chips.push({
    label: `Return within ${policy.return_window_days} day${
      policy.return_window_days === 1 ? "" : "s"
    }`,
    icon: "📅",
  });
  chips.push({
    label: policy.requires_receipt ? "Receipt required" : "No receipt needed",
    icon: "🧾",
  });
  if (policy.restocking_fee_percent > 0) {
    chips.push({
      label: `${policy.restocking_fee_percent}% restocking fee`,
      icon: "💸",
    });
  } else {
    chips.push({ label: "No restocking fee", icon: "✅" });
  }
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-label-md text-ink-muted border border-line"
        >
          <span aria-hidden>{c.icon}</span>
          {c.label}
        </span>
      ))}
    </div>
  );
}

export default function ReturnPolicyPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    let cancelled = false;
    policiesApi
      .list()
      .then((payload) => {
        if (cancelled) return;
        // Public endpoint returns either {results: [...]} or a bare array.
        const list = Array.isArray(payload)
          ? payload
          : payload.results || [];
        setPolicy(list[0] || null);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err?.response?.data?.detail ||
            "We couldn't load the return policy right now. Please try again in a moment.",
        );
        setPolicy(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container-page py-10 max-w-3xl">
      <div className="mb-6">
        <div className="eyebrow text-primary mb-1">Help center</div>
        <h1 className="text-headline-lg text-ink">Return policy</h1>
        <p className="text-body-md text-ink-muted mt-2">
          Everything you need to know about returns, refunds, and exchanges at
          MobileHub.
        </p>
      </div>

      {loading ? (
        <div className="card p-10 flex items-center justify-center">
          <Spinner />
        </div>
      ) : error ? (
        <div className="card p-6">
          <p className="text-body-md text-danger">{error}</p>
        </div>
      ) : !policy ? (
        <div className="card p-8 text-center space-y-3">
          <p className="text-title-md text-ink">
            Return policy isn't available yet
          </p>
          <p className="text-body-md text-ink-muted">
            We're putting the finishing touches on this page. In the meantime,
            our support team can help with any return questions.
          </p>
          <Link to="/contact" className="btn-secondary inline-flex">
            Contact support
          </Link>
        </div>
      ) : (
        <div className="card p-6 space-y-6">
          <div className="space-y-3">
            <h2 className="text-title-lg text-ink">{policy.title}</h2>
            {policy.summary ? (
              <p className="text-body-md text-ink-muted">{policy.summary}</p>
            ) : null}
            <MetadataChips policy={policy} />
            <p className="text-label-md text-ink-faint">
              Last updated: {formatDate(policy.updated_at)}
            </p>
          </div>

          {Array.isArray(policy.paragraphs) && policy.paragraphs.length > 0 ? (
            <div className="space-y-4">
              {policy.paragraphs.map((p, i) => (
                <p key={i} className="text-body-md text-ink whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-body-md text-ink-muted">
              No additional details have been published.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 text-label-md">
        <Link to="/terms" className="text-primary hover:underline">
          Read our terms of service →
        </Link>
        <Link to="/privacy" className="text-ink-muted hover:text-ink">
          Privacy policy
        </Link>
        <Link to="/orders" className="text-ink-muted hover:text-ink">
          ← Back to my orders
        </Link>
      </div>
    </div>
  );
}
