import { create } from "zustand";
import { notificationsApi } from "../api";

/**
 * Customer notification store + polling.
 *
 * Drives the navbar bell: every 30s we fetch the customer's latest
 * notifications (placement, paid, status updates) and update the unread
 * badge. Newly-arrived rows also surface as toasts via `notify` in the
 * component itself. Polling lifecycle is started by the bell component
 * (`useEffect`) and torn down on unmount/logout.
 *
 * Kept separate from `useNotificationStore` (the admin one) so admin and
 * customer polling never collide.
 */
const POLL_MS = 30_000;

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
  },

  stop: () => {
    const t = get()._timer;
    if (t) clearInterval(t);
    set({
      _timer: null,
      notifications: [],
      unreadCount: 0,
      open: false,
    });
  },

  reset: () => set({ notifications: [], unreadCount: 0, open: false }),
}));
