import axios from "axios";
import { useAuthStore } from "../stores/authStore";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Attach access token on every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().access;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let refreshQueue = [];

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url.includes("/auth/login") &&
      !original.url.includes("/auth/register")
    ) {
      const { refresh, logout } = useAuthStore.getState();
      if (!refresh) {
        logout();
        return Promise.reject(error);
      }
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, {
          refresh,
        });
        // simplejwt with ROTATE_REFRESH_TOKENS issues a new refresh on
        // every successful refresh; the old one gets blacklisted. Persist
        // the rotated refresh so we don't get force-logged-out on the
        // next API call.
        const patch = { access: data.access };
        if (data.refresh) patch.refresh = data.refresh;
        useAuthStore.setState(patch);
        refreshQueue.forEach(({ resolve }) => resolve(data.access));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch (e) {
        refreshQueue.forEach(({ reject }) => reject(e));
        refreshQueue = [];
        // Refresh failed — only force-logout if the server says the
        // token is actually invalid (401). Network errors / timeouts
        // should not silently sign the user out.
        if (e?.response?.status === 401) logout();
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export { BASE_URL };