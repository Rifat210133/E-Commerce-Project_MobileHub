import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ordersApi } from "../api";
import { useCartStore } from "../stores/cartStore";
import { useUIStore } from "../stores/uiStore";
import ProductCard from "../components/ProductCard";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";

export default function WishlistPage() {
  const [items, setItems] = useState(null);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const notify = useUIStore((s) => s.notify);

  const load = () =>
    ordersApi.getWishlist().then((d) => {
      // Backend returns {id, products: [...], created_at}; older shapes
      // were either a plain list or a paginated {results: [...]} object.
      const list = Array.isArray(d)
        ? d
        : d?.results || d?.products || [];
      // Normalize so the rest of the page can treat each entry as
      // { id, product: {...} } the way it was originally written.
      const normalized = list.map((entry) =>
        entry?.product ? entry : { id: entry.id, product: entry }
      );
      setItems(normalized);
    });

  useEffect(() => { load(); }, []);

  const remove = async (productId) => {
    try {
      await ordersApi.removeFromWishlist(productId);
      notify("Removed from wishlist", "info");
    } catch (e) {
      notify("Could not remove item", "error");
    }
    load();
  };

  const move = async (productId) => {
    const item = items.find((i) => i.product?.id === productId);
    if (!item) return;
    try {
      await ordersApi.addToCart(productId, 1);
      await ordersApi.removeFromWishlist(productId);
      await fetchCart();
      notify("Moved to cart", "success");
    } catch (e) {
      notify("Could not move to cart", "error");
    }
    load();
  };

  if (items === null) return <Spinner />;
  if (!items.length) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon="favorite_border"
          title="Your wishlist is empty"
          message="Tap the heart on any product to save it for later."
          action={<Link to="/catalog" className="btn-primary">Browse phones</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <div className="eyebrow text-primary mb-1">Saved for later</div>
        <h1 className="text-headline-lg text-ink">My wishlist</h1>
        <p className="text-body-md text-ink-muted mt-1">{items.length} item{items.length === 1 ? "" : "s"}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {items.map((it) => (
          <div key={it.id} className="relative">
            <ProductCard product={it.product} />
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
              <button onClick={() => move(it.product.id)} className="w-9 h-9 rounded-full bg-white shadow-soft text-primary hover:bg-primary hover:text-white flex items-center justify-center transition-colors" title="Move to cart">
                <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
              </button>
              <button onClick={() => remove(it.product.id)} className="w-9 h-9 rounded-full bg-white shadow-soft text-accent-danger hover:bg-accent-danger hover:text-white flex items-center justify-center transition-colors" title="Remove">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}