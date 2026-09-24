import type { ButtonHTMLAttributes } from "react";

// MCC design system — a reusable button, built for Recruiting 2.0 but
// intentionally not recruiting-specific, so a later dashboard-wide pass can
// adopt it as-is. Three variants + two sizes cover every button this
// project needs; extend rather than fork if a new page needs another look.
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 disabled:bg-neutral-300",
  secondary:
    "bg-gold-500 text-brand-900 hover:bg-gold-600 focus-visible:ring-gold-400 disabled:bg-neutral-200 disabled:text-neutral-400",
  ghost:
    "bg-transparent text-brand-700 border border-brand-200 hover:bg-brand-50 focus-visible:ring-brand-300 disabled:text-neutral-300 disabled:border-neutral-200",
  danger:
    "bg-white text-red-700 border border-red-200 hover:bg-red-50 focus-visible:ring-red-300 disabled:text-neutral-300",
};

const SIZE_CLASSES: Record<Size, string> = {
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3.5 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:shadow-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}
