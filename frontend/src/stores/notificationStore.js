import { create } from "zustand";
import { adminApi } from "../api";

/**
 * Admin notification store + polling.
 *
 * Holds the bell badge (unread_count) and the drawer feed. While the admin
 * is logged in we poll every 30s; the user (or unmount) can stop polling
 * via `stop()` (used on logout or when the user isn't an admin).
 *
 * Newly-arrived rows are surfaced as toast notifications (via `notify`) so
 * admins see them even if they haven't opened the drawer.
 */
const POLL_MS = 30_000;

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
  },

  stop: () => {
    const t = get()._timer;
    if (t) clearInterval(t);
    set({ _timer: null, notifications: [], unreadCount: 0, open: false });
  },

  reset: () => set({ notifications: [], unreadCount: 0, open: false }),
}));