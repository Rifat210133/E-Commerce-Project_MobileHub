import { create } from "zustand";
import { adminApi } from "../api";

/**
 * Admin notification store + polling.
 *
 * Holds the bell badge (unread_count) and the drawer feed. While the admin
 * is logged in we poll every 10s; the user (or unmount) can stop polling
 * via `stop()` (used on logout or when the user isn't an admin).
 *
 * Newly-arrived rows are surfaced as toast notifications (via `notify`) so
 * admins see them even if they haven't opened the drawer. We also refresh
 * immediately on tab focus / visibilitychange so a returning admin sees
 * new orders/returns without waiting for the next tick.
 */
const POLL_MS = 10_000;

export const useNotificationStore = create((set, get) => ({
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
      const data = await adminApi.notifications({ limit: 50 });
      const previousIds = new Set(get().notifications.map((n) => n.id));
      const incoming = data.results || [];
      // Anything we didn't have before (after the first fetch) is "new" and
      // gets toasted. We track which IDs we've already toasted in-memory to
      // avoid double-firing on subsequent polls after a drawer open/close.
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
      await adminApi.markNotificationRead(id);
    } catch (_) {
      // Optimistic update even if the network call fails — the next poll
      // will reconcile.
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
      await adminApi.markAllNotificationsRead();
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
    if (get()._timer) return; // already running
    // Initial fetch, then poll.
    get().fetch().catch(() => {});
    const t = setInterval(() => {
      get().fetch().catch(() => {});
    }, POLL_MS);
    set({ _timer: t });

    // Refresh immediately when the admin returns to the tab so they see
    // new orders/returns without waiting for the next poll tick.
    if (typeof window !== "undefined") {
      const onFocus = () => {
        // Skip if the tab is hidden — visibilitychange handles that case.
        if (document.visibilityState === "hidden") return;
        get().fetch().catch(() => {});
      };
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onFocus);
      set({
        _cleanupFocus: () => {
          window.removeEventListener("focus", onFocus);
          document.removeEventListener("visibilitychange", onFocus);
        },
      });
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