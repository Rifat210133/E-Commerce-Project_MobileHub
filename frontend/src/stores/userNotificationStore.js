import { create } from "zustand";
import { notificationsApi } from "../api";

/**
 * Customer notification store + polling.
 *
 * Drives the navbar bell: every 10s we fetch the customer's latest
 * notifications (placement, paid, status updates) and update the unread
 * badge. Newly-arrived rows also surface as toasts via `notify` in the
 * component itself. Polling lifecycle is started by the bell component
 * (`useEffect`) and torn down on unmount/logout.
 *
 * We also refresh immediately on visibilitychange / window focus so a
 * customer who switches back to the tab (e.g. after closing the bKash
 * popup) sees the new notification without waiting for the next tick.
 *
 * Kept separate from `useNotificationStore` (the admin one) so admin and
 * customer polling never collide.
 */
const POLL_MS = 10_000;

export const useUserNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  open: false,
  _timer: null,

  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),

  fetch: async () => {
    set({ loading: true });
    try {
      const data = await notificationsApi.list({ limit: 50 });
      const previousIds = new Set(get().notifications.map((n) => n.id));
      const incoming = data.results || [];
      const newOnes = incoming.filter((n) => !previousIds.has(n.id));
      set({
        notifications: incoming,
        unreadCount: data.unread_count ?? 0,
        loading: false,
      });
      return { newOnes, all: incoming };
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  markRead: async (id) => {
    try {
      await notificationsApi.markRead(id);
    } catch (_) {
      // Optimistic — next poll reconciles.
    }
    set((s) => {
      const notifications = s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.is_read).length,
      };
    });
  },

  markAllRead: async () => {
    try {
      await notificationsApi.markAllRead();
    } catch (_) {
      // Optimistic.
    }
    set((s) => {
      const notifications = s.notifications.map((n) =>
        n.is_read ? n : { ...n, is_read: true, read_at: new Date().toISOString() }
      );
      return { notifications, unreadCount: 0 };
    });
  },

  start: () => {
    if (get()._timer) return;
    get().fetch().catch(() => {});
    const t = setInterval(() => {
      get().fetch().catch(() => {});
    }, POLL_MS);
    set({ _timer: t });

    // Refresh on tab focus / visibilitychange. The first fetch already
    // happens in `start()`, this is the "user came back" path — without
    // it a customer returning from another tab could wait the full
    // POLL_MS interval before seeing the new "Order Paid" notification.
    if (typeof window !== "undefined") {
      const onFocus = () => get().fetch().catch(() => {});
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onFocus);
      get()._cleanupFocus = () => {
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onFocus);
      };
    }
  },

  stop: () => {
    const t = get()._timer;
    if (t) clearInterval(t);
    const cleanup = get()._cleanupFocus;
    if (cleanup) cleanup();
    set({
      _timer: null,
      _cleanupFocus: null,
      notifications: [],
      unreadCount: 0,
      open: false,
    });
  },

  reset: () => set({ notifications: [], unreadCount: 0, open: false }),
}));
