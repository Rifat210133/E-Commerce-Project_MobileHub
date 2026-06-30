import { useUIStore } from "../stores/uiStore";
import Icon from "./Icon";

const variantStyle = {
  info: "bg-white border-surface-border text-ink",
  success: "bg-white border-accent-success/40 text-ink",
  warning: "bg-white border-accent-warning/40 text-ink",
  error: "bg-white border-accent-danger/40 text-ink",
};

const variantIcon = {
  info: "info",
  success: "check_circle",
  warning: "warning",
  error: "error",
};

const variantIconColor = {
  info: "text-accent-info",
  success: "text-accent-success",
  warning: "text-accent-warning",
  error: "text-accent-danger",
};

export default function Toasts() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-md border px-4 py-3 shadow-elevated animate-in fade-in slide-in-from-right ${variantStyle[t.variant] || variantStyle.info}`}
        >
          <Icon name={variantIcon[t.variant] || variantIcon.info} className={variantIconColor[t.variant]} />
          <div className="flex-1 text-body-sm">{t.message}</div>
          <button onClick={() => dismiss(t.id)} className="text-ink-subtle hover:text-ink">
            <Icon name="close" size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}