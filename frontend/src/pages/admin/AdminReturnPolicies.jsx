import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import Icon from "../../components/Icon";
import Spinner from "../../components/Spinner";

const EMPTY = {
  title: "",
  summary: "",
  body: "",
  return_window_days: 14,
  requires_receipt: true,
  restocking_fee_percent: 0,
  is_active: true,
};

function nextEditing(editing, patch) {
  return { ...(editing || EMPTY), ...patch };
}

export default function AdminReturnPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null = none, "new" = create form
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const refresh = async () => {
    const res = await adminApi.adminReturnPolicies();
    const list = Array.isArray(res) ? res : res.results || [];
    list.sort((a, b) => {
      // active rows first, then most recently updated
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
    setPolicies(list);
    return list;
  };

  useEffect(() => {
    let alive = true;
    refresh()
      .catch((err) => {
        if (!alive) return;
        showToast(
          err?.response?.data?.detail || "Failed to load policies.",
          "error",
        );
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const showToast = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2400);
  };

  const startNew = () => {
    setEditingId("new");
    setDraft(EMPTY);
  };

  const startEdit = (policy) => {
    setEditingId(policy.id);
    setDraft({
      title: policy.title || "",
      summary: policy.summary || "",
      body: policy.body || "",
      return_window_days: policy.return_window_days ?? 14,
      requires_receipt: Boolean(policy.requires_receipt),
      restocking_fee_percent: policy.restocking_fee_percent ?? 0,
      is_active: Boolean(policy.is_active),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY);
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      showToast("Title is required.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        body: draft.body,
        return_window_days: Number(draft.return_window_days) || 0,
        requires_receipt: Boolean(draft.requires_receipt),
        restocking_fee_percent: Number(draft.restocking_fee_percent) || 0,
        is_active: Boolean(draft.is_active),
      };
      if (editingId === "new") {
        await adminApi.createReturnPolicy(payload);
        showToast("Policy created.", "success");
      } else {
        await adminApi.updateReturnPolicy(editingId, payload);
        showToast("Policy updated.", "success");
      }
      const list = await refresh();
      // Re-select the row we just saved so the form stays in sync.
      const fresh = list.find((p) =>
        editingId === "new"
          ? p.title === payload.title
          : p.id === editingId,
      );
      if (fresh) {
        setEditingId(fresh.id);
        setDraft({
          title: fresh.title || "",
          summary: fresh.summary || "",
          body: fresh.body || "",
          return_window_days: fresh.return_window_days ?? 14,
          requires_receipt: Boolean(fresh.requires_receipt),
          restocking_fee_percent: fresh.restocking_fee_percent ?? 0,
          is_active: Boolean(fresh.is_active),
        });
      } else {
        cancelEdit();
      }
    } catch (err) {
      const data = err?.response?.data;
      const msg =
        (data && typeof data === "object" && Object.keys(data).length
          ? Object.entries(data)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .join("; ")
          : null) ||
        data?.detail ||
        "Failed to save policy.";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (policy) => {
    if (
      !confirm(
        `Delete "${policy.title}"? This cannot be undone. Customers will no longer see this policy if it's the only active one.`,
      )
    )
      return;
    setDeletingId(policy.id);
    try {
      await adminApi.deleteReturnPolicy(policy.id);
      showToast("Policy deleted.", "success");
      if (editingId === policy.id) cancelEdit();
      await refresh();
    } catch (err) {
      showToast(
        err?.response?.data?.detail || "Failed to delete policy.",
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const onToggle = async (policy) => {
    try {
      const updated = await adminApi.toggleReturnPolicy(policy.id);
      showToast(
        updated.is_active ? "Policy published." : "Policy hidden.",
        "success",
      );
      const list = await refresh();
      if (editingId === policy.id) {
        setDraft((d) => nextEditing(d, { is_active: Boolean(updated.is_active) }));
      }
      return list;
    } catch (err) {
      showToast(
        err?.response?.data?.detail || "Failed to toggle policy.",
        "error",
      );
    }
  };

  const wordCount = useMemo(
    () => (draft.body ? draft.body.trim().split(/\s+/).length : 0),
    [draft.body],
  );
  const paragraphs = useMemo(
    () =>
      draft.body
        ? draft.body
            .split(/\n\s*\n/g)
            .map((p) => p.trim())
            .filter(Boolean)
        : [],
    [draft.body],
  );

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow text-primary mb-1">Storefront</div>
          <h1 className="text-headline-md font-headline-md">
            Return policies
          </h1>
          <p className="text-body-md text-ink-muted mt-1">
            Author the return policy customers see on the storefront. The
            latest active policy is shown at <code>/return-policy</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="btn-primary"
          disabled={editingId === "new"}
        >
          <Icon name="add" size={18} />
          New policy
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: list of policies */}
        <div className="bg-white border border-surface-border rounded-2xl p-4 space-y-3">
          <div className="text-label-md text-ink-muted uppercase tracking-wide px-1">
            All policies ({policies.length})
          </div>
          {policies.length === 0 ? (
            <p className="text-body-md text-ink-muted p-2">
              No policies yet. Click "New policy" to create one.
            </p>
          ) : (
            policies.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-3 ${
                    isEditing
                      ? "border-primary bg-primary-50/40"
                      : "border-surface-border bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-title-md text-ink line-clamp-1">
                        {p.title}
                      </div>
                      <div className="text-label-sm text-ink-subtle mt-0.5">
                        v{p.id} · updated{" "}
                        {new Date(p.updated_at).toLocaleDateString()}
                      </div>
                      {p.summary && (
                        <p className="text-label-md text-ink-muted mt-1 line-clamp-2">
                          {p.summary}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span
                          className={`inline-block text-label-sm px-2 py-0.5 rounded-full ${
                            p.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-surface-alt text-ink-subtle"
                          }`}
                        >
                          {p.is_active ? "Active" : "Hidden"}
                        </span>
                        <span className="inline-block text-label-sm px-2 py-0.5 rounded-full bg-surface-alt text-ink-muted">
                          {p.return_window_days}d window
                        </span>
                        {p.restocking_fee_percent > 0 && (
                          <span className="inline-block text-label-sm px-2 py-0.5 rounded-full bg-surface-alt text-ink-muted">
                            {p.restocking_fee_percent}% fee
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="btn-outline text-label-md py-1 px-3"
                    >
                      <Icon name="edit" size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(p)}
                      className="btn-outline text-label-md py-1 px-3"
                    >
                      <Icon
                        name={p.is_active ? "visibility_off" : "visibility"}
                        size={14}
                      />
                      {p.is_active ? "Hide" : "Publish"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      className="btn-outline text-label-md py-1 px-3 text-danger border-danger/40 hover:bg-danger/5"
                      disabled={deletingId === p.id}
                    >
                      <Icon name="delete" size={14} />
                      {deletingId === p.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: editor */}
        <div className="lg:col-span-2 bg-white border border-surface-border rounded-2xl p-6 space-y-5">
          {editingId == null ? (
            <div className="text-center py-10 space-y-3">
              <Icon
                name="policy"
                size={48}
                className="text-ink-subtle mx-auto"
              />
              <p className="text-title-md text-ink">
                Select a policy to edit
              </p>
              <p className="text-body-md text-ink-muted">
                Or create a new one to replace the active policy customers see.
              </p>
              <button
                type="button"
                onClick={startNew}
                className="btn-primary"
              >
                <Icon name="add" size={18} />
                New policy
              </button>
            </div>
          ) : (
            <form onSubmit={onSave} className="space-y-5">
              <div>
                <label className="text-label-md text-ink block mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) => nextEditing(d, { title: e.target.value }))
                  }
                  className="input w-full"
                  placeholder="Return Policy"
                  maxLength={120}
                  required
                  disabled={saving}
                />
              </div>

              <div>
                <label className="text-label-md text-ink block mb-2">
                  Summary (one line shown above the body)
                </label>
                <input
                  type="text"
                  value={draft.summary}
                  onChange={(e) =>
                    setDraft((d) =>
                      nextEditing(d, { summary: e.target.value }),
                    )
                  }
                  className="input w-full"
                  placeholder="How returns, refunds, and exchanges work."
                  maxLength={255}
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-label-md text-ink block mb-2">
                    Return window (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={draft.return_window_days}
                    onChange={(e) =>
                      setDraft((d) =>
                        nextEditing(d, {
                          return_window_days: Number(e.target.value) || 0,
                        }),
                      )
                    }
                    className="input w-full"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="text-label-md text-ink block mb-2">
                    Restocking fee (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.restocking_fee_percent}
                    onChange={(e) =>
                      setDraft((d) =>
                        nextEditing(d, {
                          restocking_fee_percent:
                            Number(e.target.value) || 0,
                        }),
                      )
                    }
                    className="input w-full"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="text-label-md text-ink block mb-2">
                    Requires receipt?
                  </label>
                  <label className="flex items-center gap-3 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.requires_receipt}
                      onChange={(e) =>
                        setDraft((d) =>
                          nextEditing(d, {
                            requires_receipt: e.target.checked,
                          }),
                        )
                      }
                      disabled={saving}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-body-md text-ink-muted">
                      {draft.requires_receipt ? "Yes" : "No"}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-label-md text-ink block mb-2">
                  Body
                </label>
                <textarea
                  value={draft.body}
                  onChange={(e) =>
                    setDraft((d) =>
                      nextEditing(d, { body: e.target.value }),
                    )
                  }
                  className="input w-full font-mono text-body-md"
                  rows={14}
                  placeholder={"Use a blank line between paragraphs.\n\nFirst paragraph...\n\nSecond paragraph..."}
                  disabled={saving}
                />
                <div className="flex justify-between text-label-sm text-ink-subtle mt-1">
                  <span>
                    Separated paragraphs: {paragraphs.length}
                  </span>
                  <span>Words: {wordCount}</span>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) =>
                    setDraft((d) =>
                      nextEditing(d, { is_active: e.target.checked }),
                    )
                  }
                  disabled={saving}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-label-md text-ink">
                  Active — show this policy on the storefront
                  <span className="block text-label-sm text-ink-muted mt-0.5">
                    Only one active policy is shown to customers at a time. The
                    most recently updated active policy wins if there are
                    multiple.
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap gap-3 pt-3 border-t border-surface-border">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  <Icon name="save" size={18} />
                  {saving
                    ? "Saving…"
                    : editingId === "new"
                    ? "Create policy"
                    : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="btn-outline"
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>

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
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
