export const fmt = {
  // Bangladesh Taka by default. Uses Latin digits via the "en-US" locale and
  // appends the literal "TK" suffix (e.g. "1,037TK") so the amount always
  // reads in English script, regardless of the host runtime's locale data.
  money: (n, _currency = "BDT") => {
    const num = Number(n) || 0;
    const formatted = num.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return `${formatted}TK`;
  },

  percent: (n) =>
    new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(n),

  compact: (n) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n),

  date: (iso) =>
    new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),

  dateLong: (iso) =>
    new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }),

  relative: (iso) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  },
};

export const statusColor = (status) => {
  // All order lifecycle states render in the brand "primary" blue so shoppers
  // see a consistent visual treatment for any tracked status.
  const s = (status || "").toLowerCase();
  if (s === "shipped" || s === "out_for_delivery") return "info";
  if (s === "cancelled" || s === "returned") return "danger";
  return "primary"; // pending, confirmed, processing, delivered
};

export const statusLabel = (status) => {
  const map = {
    pending: "Pending",
    confirmed: "Confirmed",
    processing: "Processing",
    shipped: "Shipped",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    returned: "Returned",
  };
  return map[status?.toLowerCase()] || status;
};

export const inventoryLevel = (stock) => {
  if (stock <= 0) return { label: "Out of stock", variant: "danger" };
  if (stock < 5) return { label: "Critical", variant: "danger" };
  if (stock < 15) return { label: "Low", variant: "warning" };
  return { label: "In stock", variant: "success" };
};