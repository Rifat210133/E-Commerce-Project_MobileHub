import { create } from "zustand";

export const useUIStore = create((set) => ({
  toasts: [],

  pushToast: (toast) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        {
          id: Date.now() + Math.random(),
          variant: "info",
          ...toast,
        },
      ],
    })),

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // Convenience helpers
  notify: (message, variant = "info") => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
}));