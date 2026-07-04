import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useCartStore } from "../stores/cartStore";
import { useUIStore } from "../stores/uiStore";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import { fmt } from "../lib/format";

// Build a friendly toast for any add-to-cart / update-qty failure.
// Returns the generic detail string when stock info isn't present.
function stockErrorMessage(err, fallback) {
  const data = err?.stockError || err?.response?.data;
  if (data && (data.available !== undefined || data.requested !== undefined)) {
    const avail = Number(data.available ?? 0);
    const req = Number(data.requested ?? 0);
    if (avail <= 0) return "Out of stock — can't update this line.";
    return `Only ${avail} in stock — you asked for ${req}.`;
  }
  return data?.detail || fallback;
}

export default function CartPage() {
  const navigate = useNavigate();
  const { items, subtotal, shipping, tax, total, updateQty, removeItem, fetchCart } = useCartStore();
  const notify = useUIStore((s) => s.notify);

  // Always re-sync the cart from the server when the page mounts. After
  // checkout the backend empties the cart; this guarantees the UI reflects
  // that even if the user lands here without the checkout-time reset.
  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  // Wraps the store's updateQty with friendly error reporting so the user
  // sees "Only N in stock — you asked for M" when they exceed inventory.
  const handleQty = async (lineId, requestedQty, productName) => {
    try {
      await updateQty(lineId, requestedQty);
    } catch (err) {
      notify(
        stockErrorMessage(err, `Could not update ${productName}.`),
        "error"
      );
      // Re-sync the cart so the UI snaps back to the server's truth
      // (clamping the local quantity to whatever stock actually allows).
      fetchCart();
    }
  };

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
            // Available stock for this line. Fall back to the current
            // quantity + 1 so the + button never disables in the absence
            // of stock data (older cart lines may not include it).
            const stock = Number(item.product?.stock);
            const stockKnown = Number.isFinite(stock) && stock >= 0;
            const stockCap = stockKnown ? Math.max(stock, item.quantity) : Infinity;
            const outOfStock = stockKnown && stock <= 0;
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
                {stockKnown && (
                  <div className={`text-label-sm mt-1 ${stock <= item.quantity ? "text-accent-warning" : "text-ink-subtle"}`}>
                    {outOfStock
                      ? "Out of stock"
                      : stock <= item.quantity
                        ? `Only ${stock} in stock`
                        : `${stock} in stock`}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center border border-surface-border rounded-sm overflow-hidden">
                  <button
                    onClick={() => handleQty(lineId, item.quantity - 1, item.product.name)}
                    disabled={item.quantity <= 1}
                    className="px-2 h-9 hover:bg-surface-alt disabled:opacity-50 disabled:hover:bg-transparent"
                    aria-label="Decrease quantity"
                  >
                    <Icon name="remove" size={18} />
                  </button>
                  <input
                    value={item.quantity}
                    type="number"
                    min={1}
                    max={stockKnown ? stock : undefined}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      if (!Number.isFinite(raw) || raw < 1) return;
                      const cap = stockKnown ? stock : raw;
                      handleQty(lineId, Math.min(raw, cap), item.product.name);
                    }}
                    className="w-10 h-9 text-center text-label-md border-x border-surface-border [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => handleQty(lineId, item.quantity + 1, item.product.name)}
                    disabled={item.quantity >= stockCap}
                    className="px-2 h-9 hover:bg-surface-alt disabled:opacity-50 disabled:hover:bg-transparent"
                    aria-label="Increase quantity"
                  >
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