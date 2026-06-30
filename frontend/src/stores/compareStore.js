import { create } from "zustand";
import { comparisonApi } from "../api";
import { useAuthStore } from "./authStore";

const MAX = 4;

export const useCompareStore = create((set, get) => ({
  items: [],
  count: 0,
  isLoading: false,
  error: null,
  /** Set used by ProductCard checkbox to check membership cheaply. */
  ids: new Set(),

  fetch: async () => {
    if (!useAuthStore.getState().isAuthenticated()) {
      set({ items: [], ids: new Set(), count: 0 });
      return;
    }
    set({ isLoading: true });
    try {
      const data = await comparisonApi.list();
      const items = data.products || [];
      set({
        items,
        count: data.count ?? items.length,
        ids: new Set(items.map((p) => p.id)),
        isLoading: false,
      });
    } catch (e) {
      set({ isLoading: false, error: "Could not load compare list" });
    }
  },

  toggle: async (productId) => {
    const { ids, items } = get();
    if (ids.has(productId)) {
      // remove
      const next = items.filter((p) => p.id !== productId);
      const nextIds = new Set(ids);
      nextIds.delete(productId);
      set({ items: next, ids: nextIds, count: next.length });
      try {
        await comparisonApi.remove(productId);
      } catch (e) {
        // revert
        set({ items, ids, count: items.length });
        throw e;
      }
      return { added: false };
    }
    if (items.length >= MAX) {
      throw new Error(`Compare list is full (max ${MAX}).`);
    }
    // optimistic add with placeholder
    const placeholder = { id: productId, name: "Loading…", brand_name: "" };
    const next = [...items, placeholder];
    const nextIds = new Set(ids);
    nextIds.add(productId);
    set({ items: next, ids: nextIds, count: next.length });
    try {
      const data = await comparisonApi.add(productId);
      const fresh = data.products || [];
      set({
        items: fresh,
        ids: new Set(fresh.map((p) => p.id)),
        count: data.count ?? fresh.length,
      });
      return { added: true };
    } catch (e) {
      // revert
      set({ items, ids, count: items.length });
      throw e;
    }
  },

  remove: async (productId) => {
    const data = await comparisonApi.remove(productId);
    const fresh = data.products || [];
    set({
      items: fresh,
      ids: new Set(fresh.map((p) => p.id)),
      count: data.count ?? fresh.length,
    });
  },

  clear: async () => {
    await comparisonApi.clear();
    set({ items: [], ids: new Set(), count: 0 });
  },

  reset: () => set({ items: [], ids: new Set(), count: 0 }),

  has: (id) => get().ids.has(id),
}));