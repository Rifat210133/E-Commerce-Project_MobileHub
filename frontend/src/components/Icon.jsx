export default function Icon({ name, className = "", filled = false, size }) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? "icon-filled" : ""} ${className}`}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  );
}