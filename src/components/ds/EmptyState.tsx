import type { ReactNode } from "react";

// A warm "nothing here yet" state — used anywhere a list could genuinely be
// empty (no qualified applicants right now, no open interview slots, etc.)
// so an empty screen still feels intentional rather than broken.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-3xl">{icon}</div>}
      <p className="font-semibold text-brand-800">{title}</p>
      {description && <p className="max-w-sm text-sm text-neutral-600">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// A one-glance "you're done / it worked" state — green accent, calm tone.
export function SuccessState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-6 py-12 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-2xl text-white">
        ✓
      </div>
      <p className="font-semibold text-green-800">{title}</p>
      {description && <p className="max-w-sm text-sm text-green-700">{description}</p>}
    </div>
  );
}
