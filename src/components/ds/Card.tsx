import type { ReactNode } from "react";

// A plain, warm content container — the base unit most MCC design-system
// pages are built from. `padded={false}` for cards that manage their own
// internal spacing (e.g. a card with a full-bleed image up top).
export default function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white shadow-sm ${padded ? "p-5 sm:p-6" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// A section wrapper for the marketing-style careers page — full-width band
// with generous vertical rhythm and an optional tinted background, so long
// pages read as distinct chapters rather than one undifferentiated scroll.
export function SectionContainer({
  children,
  className = "",
  tint = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  tint?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={`px-4 py-14 sm:px-8 sm:py-20 ${tint ? "bg-brand-50" : "bg-white"} ${className}`}>
      <div className="mx-auto max-w-4xl">{children}</div>
    </section>
  );
}
