import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Toasts from "./components/Toasts";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuthStore } from "./stores/authStore";
import { useCartStore } from "./stores/cartStore";

import HomePage from "./pages/HomePage";
import CatalogPage from "./pages/CatalogPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import OrdersPage from "./pages/OrdersPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import WishlistPage from "./pages/WishlistPage";
import ComparePage from "./pages/ComparePage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import CompareBar from "./components/CompareBar";
import { useCompareStore } from "./stores/compareStore";

import AdminLayout from "./pages/admin/AdminLayout";
import AnalyticsOverview from "./pages/admin/AnalyticsOverview";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminInventory from "./pages/admin/AdminInventory";
import AdminHero from "./pages/admin/AdminHero";

function Protected({ children, admin = false }) {
  const { access, user, fetchMe } = useAuthStore();
  const location = useLocation();
  useEffect(() => {
    if (access && !user) fetchMe();
  }, [access, user, fetchMe]);
  if (!access) return <Navigate to="/login" state={{ from: location }} replace />;
  // User payload exposes `is_admin` (proxies is_staff). Accept either.
  const isStaff = user?.is_admin || user?.is_staff;
  if (admin && !isStaff) return <Navigate to="/" replace />;
  return children;
}

function AdminBlocked({ children }) {
  const { user } = useAuthStore();
  // Admins/staff don't shop. If they try to open a shopping route
  // (cart, wishlist, orders, checkout) by URL, by menu, or by stale
  // link, send them to the storefront home — not the admin dashboard —
  // so it doesn't feel like a forced logout. They can always get back to
  // /admin via the navbar.
  if (user?.is_admin || user?.is_staff) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const fetchCart = useCartStore((s) => s.fetchCart);
  const fetchCompare = useCompareStore((s) => s.fetch);
  const resetCompare = useCompareStore((s) => s.reset);
  const access = useAuthStore((s) => s.access);

  useEffect(() => {
    if (access) {
      fetchCart();
      fetchCompare();
    } else {
      resetCompare();
    }
  }, [access, fetchCart, fetchCompare, resetCompare]);

  return (
    <div className="min-h-screen flex flex-col">
      <ErrorBoundary>
      <Routes>
        {/* Admin uses its own layout (no top navbar) */}
        <Route
          path="/admin/*"
          element={
            <Protected admin>
              <AdminLayout />
            </Protected>
          }
        >
          <Route index element={<AnalyticsOverview />} />
          <Route path="analytics" element={<AnalyticsOverview />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="hero" element={<AdminHero />} />
        </Route>

        {/* Customer-facing routes share the navbar/footer */}
        <Route
          path="*"
          element={
            <>
              <Navbar />
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/catalog" element={<CatalogPage />} />
                  <Route path="/recommendations" element={<RecommendationsPage />} />
                  <Route path="/product/:slug" element={<ProductDetailPage />} />
                  <Route path="/cart" element={<AdminBlocked><CartPage /></AdminBlocked>} />
                  <Route path="/checkout" element={<Protected><AdminBlocked><CheckoutPage /></AdminBlocked></Protected>} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
                  <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
                  <Route path="/orders" element={<Protected><AdminBlocked><OrdersPage /></AdminBlocked></Protected>} />
                  <Route path="/orders/:orderNumber" element={<Protected><AdminBlocked><OrderDetailPage /></AdminBlocked></Protected>} />
                  <Route path="/wishlist" element={<AdminBlocked><WishlistPage /></AdminBlocked>} />
                  <Route path="/compare" element={<ComparePage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
              <Footer />
            </>
          }
        />
      </Routes>
      <CompareBar />
      <Toasts />
      </ErrorBoundary>
    </div>
  );
}