import { statusColor, statusLabel } from "../lib/format";

const variantClass = {
  success: "bg-accent-success/15 text-accent-success",
  warning: "bg-accent-warning/15 text-accent-warning",
  danger: "bg-accent-danger/15 text-accent-danger",
  info: "bg-accent-info/15 text-accent-info",
  primary: "bg-primary-50 text-primary",
  neutral: "bg-surface-container text-ink-muted",
};

export default function StatusBadge({ status }) {
  const v = statusColor(status);
  return (
    <span className={`badge ${variantClass[v] || variantClass.neutral}`}>
      {statusLabel(status)}
    </span>
  );
}