import { create } from "zustand";

// Tracks whether the recommendations page has any active filters applied.
// Navbar uses this to hide the "For You" link when no filters are set.
export const useRecFiltersStore = create((set) => ({
  activeCount: 0,
  setActiveCount: (n) => set({ activeCount: Number(n) || 0 }),
  reset: () => set({ activeCount: 0 }),
}));