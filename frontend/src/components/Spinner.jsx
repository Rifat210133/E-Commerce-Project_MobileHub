import Icon from "./Icon";

export default function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-muted">
      <Icon name="progress_activity" size={36} className="animate-spin text-primary" />
      <div className="text-label-md">{label}</div>
    </div>
  );
}