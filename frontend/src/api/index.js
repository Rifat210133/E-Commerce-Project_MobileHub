import api from "./client";

// ----- Auth -----
export const authApi = {
  login: (credentials) => api.post("/auth/login/", credentials).then((r) => r.data),
  register: (payload) => api.post("/auth/register/", payload).then((r) => r.data),
  // Step 1 of registration — ask the backend to email a 6-digit OTP to the
  // given address. The user must present that code (via `register`) to
  // actually create the account. Server is rate-limited per IP.
  requestRegisterOtp: (email) =>
    api.post("/auth/register/otp/", { email }).then((r) => r.data),
  logout: (refresh) => api.post("/auth/logout/", { refresh }).then((r) => r.data),
  me: () => api.get("/auth/me/").then((r) => r.data),
  updateProfile: (payload) => api.patch("/auth/me/", payload).then((r) => r.data),
  requestPasswordReset: (email) =>
    api.post("/auth/password/reset/", { email }).then((r) => r.data),
  confirmPasswordReset: ({ uid, token, new_password, new_password_confirm }) =>
    api
      .post("/auth/password/reset/confirm/", {
        uid,
        token,
        new_password,
        new_password_confirm,
      })
      .then((r) => r.data),
};

// ----- Products -----
export const productsApi = {
  list: (params) => api.get("/products/", { params }).then((r) => r.data),
  featured: () => api.get("/products/featured/").then((r) => r.data),
  brands: () => api.get("/products/brands/").then((r) => r.data),
  stats: () =>
    api.get("/products/stats/").then((r) => r.data),
  detail: (slug) => api.get(`/products/${slug}/`).then((r) => r.data),
  reviews: (slug) => api.get(`/products/${slug}/reviews/`).then((r) => r.data),
  addReview: (slug, payload) =>
    api.post(`/products/${slug}/reviews/`, payload).then((r) => r.data),
};

// ----- Orders / Cart / Wishlist -----
// Backend mounts cart/* and wishlist/* at top level, orders/* for actual orders.
export const ordersApi = {
  getCart: () => api.get("/cart/").then((r) => r.data),
  addToCart: (productId, quantity = 1) =>
    api.post("/cart/add/", { product_id: productId, quantity }).then((r) => r.data),
  updateCartItem: (itemId, quantity) =>
    api.put(`/cart/update/${itemId}/`, { quantity }).then((r) => r.data),
  removeCartItem: (itemId) =>
    api.delete(`/cart/remove/${itemId}/`).then((r) => r.data),
  clearCart: () => api.delete("/cart/clear/").then((r) => r.data),
  checkout: (payload) => api.post("/orders/checkout/", payload).then((r) => r.data),
  listOrders: () => api.get("/orders/").then((r) => r.data),
  getOrder: (orderNumber) =>
    api.get(`/orders/${orderNumber}/`).then((r) => r.data),
  confirmReceived: (orderNumber, note) =>
    api
      .post(`/orders/${orderNumber}/confirm-received/`, { note: note || "" })
      .then((r) => r.data),

  getWishlist: () => api.get("/wishlist/").then((r) => r.data),
  addWishlist: (productId) =>
    api.post(`/wishlist/add/${productId}/`).then((r) => r.data),
  removeWishlist: (productId) =>
    api.delete(`/wishlist/remove/${productId}/`).then((r) => r.data),
  removeFromWishlist: (productId) =>
    api.delete(`/wishlist/remove/${productId}/`).then((r) => r.data),
};

// ----- Comparison -----
export const comparisonApi = {
  list: () => api.get("/comparison/").then((r) => r.data),
  add: (productId) =>
    api.post("/comparison/add/", { product_id: productId }).then((r) => r.data),
  remove: (productId) =>
    api.delete(`/comparison/remove/${productId}/`).then((r) => r.data),
  clear: () => api.delete("/comparison/clear/").then((r) => r.data),
};

// ----- Recommendations -----
export const recsApi = {
  aiPicks: () => api.get("/recommendations/ai-picks/").then((r) => r.data),
  youtube: (params) =>
    api.get("/recommendations/youtube/", { params }).then((r) => r.data),
  suggest: (params) =>
    api.get("/recommendations/suggest/", { params }).then((r) => r.data),
  facets: () => api.get("/recommendations/facets/").then((r) => r.data),
};

// ----- Admin / Dashboard -----
export const adminApi = {
  analyticsOverview: () =>
    api.get("/admin/analytics/overview/").then((r) => r.data),
  salesSeries: (range = "30d") =>
    api.get("/admin/analytics/sales/", { params: { range } }).then((r) => r.data),
  distribution: () =>
    api.get("/admin/analytics/distribution/").then((r) => r.data),
  inventoryAlerts: () =>
    api.get("/admin/inventory/alerts/").then((r) => r.data),

  adminOrders: (params) =>
    api.get("/admin/orders/", { params }).then((r) => r.data),
  adminOrderDetail: (orderId) =>
    api.get(`/admin/orders/${orderId}/`).then((r) => r.data),
  updateOrderStatus: (orderId, payload) =>
    api.put(`/admin/orders/${orderId}/status/`, payload).then((r) => r.data),
  markOrderPaid: (orderId) =>
    api
      .post(`/admin/orders/${orderId}/mark-paid/`)
      .then((r) => r.data),

  adminCustomers: () =>
    api.get("/admin/customers/").then((r) => r.data),

  adminProducts: (params) =>
    api.get("/admin/products/", { params }).then((r) => r.data),
  adminProductDetail: (id) =>
    api.get(`/admin/products/${id}/`).then((r) => r.data),
  createProduct: (payload) =>
    api.post("/admin/products/", payload).then((r) => r.data),
  updateProduct: (id, payload) =>
    api.patch(`/admin/products/${id}/`, payload).then((r) => r.data),
  deleteProduct: (id) =>
    api.delete(`/admin/products/${id}/`).then((r) => r.data),

  // Inventory management (list-all + per-row stock update)
  adminInventoryList: () =>
    api.get("/admin/inventory/").then((r) => r.data),
  updateStock: (id, stock) =>
    api.patch(`/admin/inventory/${id}/stock/`, { stock }).then((r) => r.data),

  // Hero feature (singleton — controls home-page "Featured today" panel)
  getHero: () => api.get("/admin/hero/").then((r) => r.data),
  updateHero: (payload) =>
    api.patch("/admin/hero/", payload).then((r) => r.data),

  // Admin notifications (bell badge + drawer feed).
  notifications: (params) =>
    api.get("/admin/notifications/", { params }).then((r) => r.data),
  markNotificationRead: (id) =>
    api.post(`/admin/notifications/${id}/read/`).then((r) => r.data),
  markAllNotificationsRead: () =>
    api.post("/admin/notifications/read-all/").then((r) => r.data),

  // Admin store-policy CMS (ReturnPolicy CRUD + active toggle).
  adminReturnPolicies: () =>
    api.get("/admin/return-policies/").then((r) => r.data),
  createReturnPolicy: (payload) =>
    api.post("/admin/return-policies/", payload).then((r) => r.data),
  updateReturnPolicy: (id, payload) =>
    api.patch(`/admin/return-policies/${id}/`, payload).then((r) => r.data),
  deleteReturnPolicy: (id) =>
    api.delete(`/admin/return-policies/${id}/`).then((r) => r.data),
  toggleReturnPolicy: (id) =>
    api.post(`/admin/return-policies/${id}/toggle/`).then((r) => r.data),

  // Admin return-request workflow (approve / reject / refund + admin_note).
  adminReturns: (params) =>
    api.get("/admin/returns/", { params }).then((r) => r.data),
  adminReturnDetail: (id) =>
    api.get(`/admin/returns/${id}/`).then((r) => r.data),
  updateReturnAdminNote: (id, admin_note) =>
    api.patch(`/admin/returns/${id}/`, { admin_note }).then((r) => r.data),
  approveReturn: (id, admin_note) =>
    api
      .post(`/admin/returns/${id}/approve/`, { admin_note })
      .then((r) => r.data),
  rejectReturn: (id, admin_note) =>
    api
      .post(`/admin/returns/${id}/reject/`, { admin_note })
      .then((r) => r.data),
  refundReturn: (id, admin_note) =>
    api
      .post(`/admin/returns/${id}/refund/`, { admin_note })
      .then((r) => r.data),
  deleteReturn: (id) =>
    api.delete(`/admin/returns/${id}/`).then((r) => r.data),
};

// ----- User notifications (customer-facing bell on the navbar) -----
// Mirror of adminApi's notifications surface but scoped to the logged-in
// customer via IsAuthenticated. Same {results, unread_count} payload.
export const notificationsApi = {
  list: (params) =>
    api.get("/notifications/", { params }).then((r) => r.data),
  markRead: (id) =>
    api.post(`/notifications/${id}/read/`).then((r) => r.data),
  markAllRead: () =>
    api.post("/notifications/read-all/").then((r) => r.data),
};

// ----- Public store policies (customer-facing CMS) ----------------------
// Read-only access to whichever policy the storefront has marked as
// is_active=True. Anonymous (unauthenticated) requests are allowed.
export const policiesApi = {
  list: () => api.get("/return-policies/").then((r) => r.data),
  detail: (slug) =>
    api.get(`/return-policies/${slug}/`).then((r) => r.data),
};

// ----- Returns (customer-facing) ---------------------------------------
// Customers can list every return they've filed, list returns for one
// order, open a new return request on a delivered order, and cancel a
// pending request. All endpoints require authentication.
export const returnsApi = {
  listMine: () => api.get("/returns/").then((r) => r.data),
  listForOrder: (orderNumber) =>
    api.get(`/orders/${orderNumber}/returns/`).then((r) => r.data),
  create: (orderNumber, payload) =>
    api
      .post(`/orders/${orderNumber}/returns/`, payload)
      .then((r) => r.data),
  cancel: (returnId) =>
    api.post(`/returns/${returnId}/cancel/`).then((r) => r.data),
};
