import Icon from "./Icon";

export default function EmptyState({ icon = "inbox", title, message, action }) {
  return (
    <div className="card flex flex-col items-center text-center px-6 py-16">
      <div className="w-16 h-16 rounded-full bg-primary-50 text-primary flex items-center justify-center mb-4">
        <Icon name={icon} size={32} />
      </div>
      <div className="text-headline-md text-ink mb-1">{title}</div>
      {message && <div className="text-body-md text-ink-muted max-w-md">{message}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}