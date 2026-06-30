import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useCartStore } from "../stores/cartStore";
import { useRecFiltersStore } from "../stores/recFiltersStore";
import { useUserNotificationStore } from "../stores/userNotificationStore";
import Icon from "./Icon";
import UserNotificationBell from "./UserNotificationBell";

export default function Navbar() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isAuthenticated, isAdmin, logout } = useAuthStore();
  const cartCount = useCartStore((s) => s.itemCount());
  const isAdminView = isAdmin && isAdmin();
  const recActiveCount = useRecFiltersStore((s) => s.activeCount);
  const showForYou = !isAdminView && recActiveCount > 0;
  // Customer bell polling — start while a non-admin user is signed in,
  // tear down on logout. The admin already has its own bell in the admin
  // header, so we hide the storefront bell from staff accounts.
  const startNotifications = useUserNotificationStore((s) => s.start);
  const stopNotifications = useUserNotificationStore((s) => s.stop);
  useEffect(() => {
    if (isAuthenticated() && !isAdminView) {
      startNotifications();
    }
    return () => stopNotifications();
    // We intentionally only react to authentication/admin-view changes;
    // the store actions are stable references from Zustand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated(), isAdminView]);

  const onSearch = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/catalog?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-surface-border shadow-sticky">
      <div className="container-page flex items-center gap-6 h-16">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-sm bg-primary text-white flex items-center justify-center">
            <Icon name="smartphone" filled />
          </div>
          <div className="leading-tight">
            <div className="text-title-md text-ink">MobileHub</div>
            <div className="text-label-sm text-ink-subtle -mt-0.5">Premium Tech Core</div>
          </div>
        </Link>

        <form onSubmit={onSearch} className="flex-1 max-w-xl">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
              <Icon name="search" size={20} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phones, brands, specs…"
              className="input pl-10"
            />
          </div>
        </form>

        <nav className="hidden md:flex items-center gap-1">
          {isAdminView ? (
            // Admins can browse the storefront like any user (so they
            // can preview what customers see), but they don't shop.
            // Show Home/Catalog/For You but skip Orders. Cart/wishlist
            // icons below are already gated by !isAdminView.
            <>
              <NavLink to="/" end className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}>
                Home
              </NavLink>
              <NavLink to="/catalog" className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}>
                Catalog
              </NavLink>
              {showForYou && (
                <NavLink to="/recommendations" className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}>
                  For You
                </NavLink>
              )}
              <NavLink to="/admin" className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}>
                <Icon name="dashboard" size={18} className="inline mr-1 -mt-0.5" />
                Admin dashboard
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/" end className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}>
                Home
              </NavLink>
              <NavLink to="/catalog" className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}>
                Catalog
              </NavLink>
              {showForYou && (
                <NavLink to="/recommendations" className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}>
                  For You
                </NavLink>
              )}
              {isAuthenticated() && (
                <NavLink to="/orders" className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}>
                  Orders
                </NavLink>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-1">
          {!isAdminView && (
            <>
              <Link to="/wishlist" className="btn-ghost relative" aria-label="Wishlist">
                <Icon name="favorite" size={22} />
              </Link>
              <Link to="/cart" className="btn-ghost relative" aria-label="Cart">
                <Icon name="shopping_cart" size={22} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-accent-gold text-white text-label-sm flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>
              {isAuthenticated() && <UserNotificationBell />}
            </>
          )}

          {isAuthenticated() ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="btn-ghost flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-label-md">
                  {(user?.first_name?.[0] || user?.username?.[0] || "U").toUpperCase()}
                </div>
                <span className="hidden md:inline text-body-md">{user?.first_name || user?.username}</span>
                <Icon name="expand_more" size={20} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-surface-border rounded-md shadow-elevated py-1">
                  <Link to="/profile" onClick={() => setMenuOpen(false)} className="block px-4 py-2 hover:bg-surface-alt">
                    <Icon name="person" size={18} className="inline mr-2" /> Profile
                  </Link>
                  {!isAdminView && (
                    <>
                      <Link to="/orders" onClick={() => setMenuOpen(false)} className="block px-4 py-2 hover:bg-surface-alt">
                        <Icon name="receipt_long" size={18} className="inline mr-2" /> My orders
                      </Link>
                      <Link to="/returns" onClick={() => setMenuOpen(false)} className="block px-4 py-2 hover:bg-surface-alt">
                        <Icon name="undo" size={18} className="inline mr-2" /> My returns
                      </Link>
                      <Link to="/wishlist" onClick={() => setMenuOpen(false)} className="block px-4 py-2 hover:bg-surface-alt">
                        <Icon name="favorite" size={18} className="inline mr-2" /> Wishlist
                      </Link>
                    </>
                  )}
                  {isAdminView && (
                    <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-4 py-2 hover:bg-surface-alt">
                      <Icon name="dashboard" size={18} className="inline mr-2" /> Admin
                    </Link>
                  )}
                  <div className="divider my-1" />
                  <button
                    onClick={async () => { setMenuOpen(false); await logout(); navigate("/"); }}
                    className="w-full text-left px-4 py-2 hover:bg-surface-alt text-accent-danger"
                  >
                    <Icon name="logout" size={18} className="inline mr-2" /> Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/register" className="btn-primary hidden md:inline-flex">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}