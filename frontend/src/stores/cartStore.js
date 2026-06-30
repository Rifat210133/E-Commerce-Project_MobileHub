import { create } from "zustand";
import { ordersApi } from "../api";

const computeTotals = (items = []) => {
  const subtotal = items.reduce(
    (sum, i) => sum + Number(i.subtotal || i.product?.price * i.quantity || 0),
    0
  );
  const shipping = items.length ? 9.99 : 0;
  // Bangladesh VAT on retail electronics (matches backend TAX_RATE).
  const tax = +(subtotal * 0.15).toFixed(2);
  const total = +(subtotal + shipping + tax).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), shipping, tax, total };
};

export const useCartStore = create((set, get) => ({
  items: [],
  ...computeTotals(),
  isLoading: false,
  error: null,

  fetchCart: async () => {
    if (!localStorage.getItem("mobilehub-auth")) return;
    set({ isLoading: true });
    try {
      const data = await ordersApi.getCart();
      const items = data.items || [];
      set({ items, ...computeTotals(items), isLoading: false });
    } catch (e) {
      set({ isLoading: false });
    }
  },

  addItem: async (productId, quantity = 1) => {
    set({ isLoading: true });
    try {
      const data = await ordersApi.addToCart(productId, quantity);
      const items = data.items || [];
      set({ items, ...computeTotals(items), isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: "Could not add item" });
      throw e;
    }
  },

  updateQty: async (itemId, quantity) => {
    if (quantity <= 0) return get().removeItem(itemId);
    const data = await ordersApi.updateCartItem(itemId, quantity);
    const items = data.items || [];
    set({ items, ...computeTotals(items) });
  },

  removeItem: async (itemId) => {
    const data = await ordersApi.removeCartItem(itemId);
    const items = data.items || [];
    set({ items, ...computeTotals(items) });
  },

  clearCart: async () => {
    await ordersApi.clearCart();
    set({ items: [], ...computeTotals([]) });
  },

  reset: () => set({ items: [], ...computeTotals([]) }),

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));