import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi } from "../api";

export const useAuthStore = create(
  persist(
    (set, get) => ({
      access: null,
      refresh: null,
      user: null,
      isLoading: false,
      error: null,

      setAccess: (token) => set({ access: token }),

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          // Backend expects {email|username, password}. Map `identifier` to the
          // right key (anything with '@' goes to `email`, otherwise `username`).
          const id = (credentials.identifier ?? credentials.email ?? credentials.username ?? "").trim();
          const payload = id.includes("@")
            ? { email: id, password: credentials.password }
            : { username: id, password: credentials.password };
          const data = await authApi.login(payload);
          set({
            access: data.access,
            refresh: data.refresh,
            user: data.user,
            isLoading: false,
          });
          return data.user;
        } catch (e) {
          set({
            isLoading: false,
            error:
              e.response?.data?.detail ||
              e.response?.data?.non_field_errors?.[0] ||
              "Login failed",
          });
          throw e;
        }
      },

      register: async (payload) => {
        set({ isLoading: true, error: null });
        try {
          const data = await authApi.register(payload);
          set({
            access: data.access,
            refresh: data.refresh,
            user: data.user,
            isLoading: false,
          });
          return data.user;
        } catch (e) {
          set({
            isLoading: false,
            error: e.response?.data?.detail || "Registration failed",
          });
          throw e;
        }
      },

      logout: async () => {
        const { refresh } = get();
        try {
          if (refresh) await authApi.logout(refresh);
        } catch {
          /* ignore */
        }
        set({ access: null, refresh: null, user: null });
      },

      fetchMe: async () => {
        if (!get().access) return null;
        try {
          const user = await authApi.me();
          set({ user });
          return user;
        } catch {
          return null;
        }
      },

      updateProfile: async (payload) => {
        const user = await authApi.updateProfile(payload);
        set({ user });
        return user;
      },

      isAuthenticated: () => !!get().access,
      // Backend's UserSerializer exposes `is_admin` (proxies is_staff).
      // Accept either key so persisted state from before this fix still works.
      isAdmin: () => !!(get().user?.is_admin || get().user?.is_staff),
    }),
    {
      name: "mobilehub-auth",
      partialize: (s) => ({ access: s.access, refresh: s.refresh, user: s.user }),
    }
  )
);