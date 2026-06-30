import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useUserNotificationStore } from "../stores/userNotificationStore";
import { useUIStore } from "../stores/uiStore";
import Icon from "./Icon";

/** Pretty timestamp for the drawer (e.g. "2m ago", "just now"). */
function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const dt = (Date.now() - t) / 1000;
  if (dt < 60) return "just now";
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  if (dt < 7 * 86400) return `${Math.floor(dt / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const LEVEL_STYLE = {
  info: "text-accent-info bg-accent-info/10",
  success: "text-accent-success bg-accent-success/10",
  warning: "text-accent-warning bg-accent-warning/10",
  error: "text-accent-danger bg-accent-danger/10",
};

// Material icon name → friendly icon for each notification kind we emit.
const KIND_ICON = {
  order_placed: "shopping_bag",
  order_paid: "payments",
  order_status: "local_shipping",
  low_stock: "warning",
};

function statusTarget(notif) {
  // Customer notifications about an order link to that order's detail page
  // (when we have an order_number). The backend writes the order FK as a
  // numeric id, so we surface "View order" with a generic orders-route that
  // opens the latest unread with an order context.
  if (notif.kind === "order_placed" || notif.kind === "order_paid" || notif.kind === "order_status") {
    return "/orders";
  }
  return null;
}

/**
 * Bell + dropdown drawer for the customer's own notifications.
 *
 * Mounted in the storefront `Navbar` (only when a non-admin user is signed
 * in). Polling is driven by the store's `start()` method (called by a
 * useEffect in this component); the component itself only renders state
 * and dispatches user actions.
 */
export default function UserNotificationBell() {
  const {
    notifications,
    unreadCount,
    open,
    toggleOpen,
    markRead,
    markAllRead,
  } = useUserNotificationStore();
  const notify = useUIStore((s) => s.notify);
  const drawerRef = useRef(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        useUserNotificationStore.setState({ open: false });
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Toast once per unseen notification ID (de-dupes across re-renders).
  const seenIdsRef = useRef(new Set());
  useEffect(() => {
    const seen = seenIdsRef.current;
    for (const n of notifications) {
      if (n.is_read) continue;
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      notify(n.title, n.level || "info");
    }
  }, [notifications, notify]);

  return (
    <div className="relative" ref={drawerRef}>
      <button
        onClick={toggleOpen}
        className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-alt text-ink"
        aria-label="Notifications"
        title="Notifications"
      >
        <Icon name="notifications" size={22} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-danger text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[520px] bg-white rounded-md border border-surface-border shadow-elevated z-40 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <div className="text-title-sm text-ink">Notifications</div>
            <button
              onClick={markAllRead}
              disabled={!unreadCount}
              className="text-label-sm text-primary disabled:text-ink-subtle hover:underline"
            >
              Mark all as read
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="px-4 py-10 text-center text-ink-subtle text-body-sm">
                You're all caught up.
              </div>
            )}
            {notifications.map((n) => {
              const icon = KIND_ICON[n.kind] || "notifications";
              const tone = LEVEL_STYLE[n.level] || LEVEL_STYLE.info;
              const target = statusTarget(n);
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-surface-border last:border-b-0 ${
                    n.is_read ? "bg-white" : "bg-primary/5"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${tone}`}
                  >
                    <Icon name={icon} size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-body-sm text-ink font-medium">{n.title}</div>
                    {n.body && (
                      <div className="text-label-sm text-ink-muted mt-0.5 line-clamp-2">
                        {n.body}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-label-sm text-ink-subtle">
                        {timeAgo(n.created_at)}
                      </span>
                      {target && (
                        <Link
                          to={target}
                          onClick={() => {
                            if (!n.is_read) markRead(n.id);
                            useUserNotificationStore.setState({ open: false });
                          }}
                          className="text-label-sm text-primary hover:underline"
                        >
                          View order
                        </Link>
                      )}
                      {!n.is_read && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="text-label-sm text-primary hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-accent-info shrink-0 mt-2" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
