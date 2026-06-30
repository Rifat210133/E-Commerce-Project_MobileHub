import { useEffect } from "react";
import Icon from "./Icon";

export default function Modal({ open, onClose, title, children, footer, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className={`bg-white rounded-md shadow-elevated w-full ${sizes[size]} flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <div className="text-title-lg text-ink">{title}</div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <Icon name="close" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="p-5 border-t border-surface-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}