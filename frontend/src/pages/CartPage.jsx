import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useCartStore } from "../stores/cartStore";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import { fmt } from "../lib/format";

export default function CartPage() {
  const navigate = useNavigate();
  const { items, subtotal, shipping, tax, total, updateQty, removeItem, fetchCart } = useCartStore();

  // Always re-sync the cart from the server when the page mounts. After
  // checkout the backend empties the cart; this guarantees the UI reflects
  // that even if the user lands here without the checkout-time reset.
  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  if (!items.length) {
    return (
      <div className="container-page py-12">
        <EmptyState
          icon="shopping_cart"
          title="Your cart is empty"
          message="Looks like you haven't added any phones yet. Let's fix that."
          action={
            <Link to="/catalog" className="btn-primary">
              <Icon name="storefront" size={20} /> Browse catalog
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <div className="eyebrow text-primary mb-1">Cart</div>
        <h1 className="text-headline-lg text-ink">Review your items</h1>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-3">
          {items.map((item) => {
            // Cart API returns `item_id` (not `id`). Normalize here so the
            // rest of the page can stay agnostic.
            const lineId = item.item_id ?? item.id;
            return (
            <div key={lineId} className="card p-4 flex gap-4">
              <Link to={`/product/${item.product.slug}`} className="w-24 h-24 rounded-sm bg-surface-alt overflow-hidden shrink-0">
                <img
                  src={
                    item.product.image ||
                    item.product.images?.[0] ||
                    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=200"
                  }
                  alt={item.product.name}
                  className="w-full h-full object-cover"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <div className="text-label-sm text-ink-subtle uppercase">{item.product.brand?.name}</div>
                <Link to={`/product/${item.product.slug}`} className="text-title-md text-ink hover:text-primary">
                  {item.product.name}
                </Link>
                <div className="text-label-md text-ink-muted mt-1">{fmt.money(item.product.price)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center border border-surface-border rounded-sm overflow-hidden">
                  <button onClick={() => updateQty(lineId, item.quantity - 1)} className="px-2 h-9 hover:bg-surface-alt">
                    <Icon name="remove" size={18} />
                  </button>
                  <span className="w-10 h-9 flex items-center justify-center text-label-md border-x border-surface-border">
                    {item.quantity}
                  </span>
                  <button onClick={() => updateQty(lineId, item.quantity + 1)} className="px-2 h-9 hover:bg-surface-alt">
                    <Icon name="add" size={18} />
                  </button>
                </div>
                <div className="text-title-md text-ink">{fmt.money(item.subtotal)}</div>
                <button onClick={() => removeItem(lineId)} className="text-label-sm text-accent-danger hover:underline">
                  <Icon name="delete_outline" size={16} className="inline" /> Remove
                </button>
              </div>
            </div>
            );
          })}
        </div>

        <aside className="card p-5 h-fit lg:sticky lg:top-20">
          <div className="text-title-lg text-ink mb-4">Order summary</div>
          <div className="space-y-3 mb-4">
            {items.map((item) => (
              <div key={`sum-${item.item_id ?? item.id}`} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-sm bg-surface-alt overflow-hidden shrink-0">
                  <img
                    src={
                      item.product.image ||
                      item.product.images?.[0] ||
                      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=200"
                    }
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-label-md text-ink truncate">{item.product.name}</div>
                  <div className="text-label-sm text-ink-muted">x {item.quantity}</div>
                </div>
                <div className="text-label-md text-ink whitespace-nowrap">
                  {fmt.money(Number(item.product.price) * Number(item.quantity))}
                </div>
              </div>
            ))}
          </div>
          <div className="divider my-4" />
          <div className="space-y-2 text-body-md">
            <div className="flex justify-between">
              <span className="text-ink-muted">Subtotal</span>
              <span className="text-ink">{fmt.money(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Shipping</span>
              <span className="text-ink">{fmt.money(shipping)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Tax (8%)</span>
              <span className="text-ink">{fmt.money(tax)}</span>
            </div>
          </div>
          <div className="divider my-4" />
          <div className="flex justify-between text-title-lg">
            <span className="text-ink">Total</span>
            <span className="text-primary font-bold">{fmt.money(total)}</span>
          </div>
          <button onClick={() => navigate("/checkout")} className="btn-primary w-full mt-5">
            Checkout <Icon name="arrow_forward" size={20} />
          </button>
          <Link to="/catalog" className="block text-center text-primary text-label-md mt-3 hover:underline">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}