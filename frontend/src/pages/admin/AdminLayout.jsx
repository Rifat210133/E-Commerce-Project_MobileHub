import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useNotificationStore } from "../../stores/notificationStore";
import Icon from "../../components/Icon";
import NotificationBell from "../../components/admin/NotificationBell";

const NAV = [
  { to: "/admin", label: "Analytics", icon: "monitoring", end: true },
  { to: "/admin/orders", label: "Orders", icon: "receipt_long" },
  { to: "/admin/products", label: "Products", icon: "smartphone" },
  { to: "/admin/hero", label: "Featured today", icon: "campaign" },
  { to: "/admin/return-policies", label: "Return policies", icon: "policy" },
  { to: "/admin/returns", label: "Returns", icon: "undo" },
  { to: "/admin/customers", label: "Customers", icon: "group" },
  { to: "/admin/inventory", label: "Inventory", icon: "inventory_2" },
];

export default function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const startNotifs = useNotificationStore((s) => s.start);
  const stopNotifs = useNotificationStore((s) => s.stop);

  // Admin-only: poll for new order notifications while the dashboard is
  // mounted. Cleanup on unmount so non-admin routes (e.g. storefront) don't
  // keep hitting the endpoint.
  useEffect(() => {
    if (user?.is_admin || user?.is_staff) {
      startNotifs();
      return () => stopNotifs();
    }
  }, [user?.is_admin, user?.is_staff, startNotifs, stopNotifs]);

  const onLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-surface-alt flex">
      <aside className="w-[280px] shrink-0 bg-ink text-white flex flex-col fixed top-0 left-0 bottom-0">
        <div className="px-6 py-6 border-b border-white/10">
          <Link to="/admin" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
              <Icon name="bolt" filled />
            </div>
            <div>
              <div className="text-title-md text-white leading-none">MobileHub</div>
              <div className="text-label-sm text-white/60 mt-1">Admin Console</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-label-md transition-colors ${
                  isActive ? "bg-primary text-white" : "text-white/70 hover:text-white hover:bg-white/5"
                }`
              }
            >
              <Icon name={n.icon} size={20} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-label-md text-white/70 hover:text-white hover:bg-white/5">
            <Icon name="storefront" size={20} />
            <span>View storefront</span>
          </Link>
        </div>
      </aside>

      <div className="flex-1 ml-[280px] flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-surface-border sticky top-0 z-30 px-6 flex items-center justify-between">
          <div className="text-title-md text-ink">Welcome back, {user?.first_name || user?.username}</div>
          <div className="flex items-center gap-3">
            {/* Primary "exit dashboard" action: navigates to the storefront
                without signing out. The user can then choose to log out
                from the navbar/user menu. */}
            <Link to="/" className="btn-outline !py-2 !px-3" title="View storefront">
              <Icon name="exit_to_app" size={18} />
              <span className="hidden md:inline ml-1">View storefront</span>
            </Link>
            <NotificationBell />
            <div className="text-right hidden sm:block">
              <div className="text-label-md text-ink">{user?.email}</div>
              <div className="text-label-sm text-ink-muted capitalize">{user?.role || "Admin"}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-title-md font-semibold">
              {(user?.first_name?.[0] || user?.username?.[0] || "A").toUpperCase()}
            </div>
            {/* The "exit" feeling is provided by the sidebar's
                "View storefront" link. Keep this header button clearly
                labeled "Log out" so admins don't accidentally sign
                themselves out when they mean to leave the dashboard. */}
            <button onClick={onLogout} className="btn-outline !py-2 !px-3" title="Log out">
              <Icon name="logout" size={18} />
              <span className="hidden sm:inline ml-1">Log out</span>
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}