import { Link } from "react-router-dom";
import Icon from "./Icon";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-surface-border bg-white">
      <div className="container-page py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-sm bg-primary text-white flex items-center justify-center">
              <Icon name="smartphone" filled />
            </div>
            <div className="text-title-md text-ink">MobileHub</div>
          </div>
          <p className="text-body-sm text-ink-muted">
            Premium smartphones, expert curation, fast checkout.
          </p>
        </div>
        <div>
          <div className="eyebrow mb-3">Shop</div>
          <ul className="space-y-2 text-body-md text-ink-muted">
            <li><Link className="link" to="/catalog">All phones</Link></li>
            <li><Link className="link" to="/catalog?tag=is_gaming">Gaming</Link></li>
            <li><Link className="link" to="/catalog?tag=is_camera_flagship">Camera</Link></li>
            <li><Link className="link" to="/catalog?tag=is_best_value">Best value</Link></li>
          </ul>
        </div>
        <div>
          <div className="eyebrow mb-3">Account</div>
          <ul className="space-y-2 text-body-md text-ink-muted">
            <li><Link className="link" to="/profile">My profile</Link></li>
            <li><Link className="link" to="/orders">My orders</Link></li>
            <li><Link className="link" to="/wishlist">Wishlist</Link></li>
            <li><Link className="link" to="/login">Sign in</Link></li>
          </ul>
        </div>
        <div>
          <div className="eyebrow mb-3">Support</div>
          <ul className="space-y-2 text-body-md text-ink-muted">
            <li><Link className="link" to="/return-policy">Return policy</Link></li>
            <li><Link className="link" to="/terms">Terms of service</Link></li>
            <li><Link className="link" to="/privacy">Privacy policy</Link></li>
            <li><span className="link inline-flex items-center gap-2"><Icon name="mail" size={18} /> support@mobilehub.com</span></li>
            <li><span className="link inline-flex items-center gap-2"><Icon name="phone" size={18} /> 1-800-MOBILE</span></li>
            <li><span className="link inline-flex items-center gap-2"><Icon name="location_on" size={18} /> San Francisco, CA</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-surface-border">
        <div className="container-page py-5 text-label-sm text-ink-subtle flex flex-col md:flex-row justify-between gap-2">
          <span>© {new Date().getFullYear()} MobileHub. All rights reserved.</span>
          <span>Premium Tech Core · Crafted with care</span>
        </div>
      </div>
    </footer>
  );
}