type Tone = "neutral" | "success" | "warning" | "danger" | "gold";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-600",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  gold: "bg-gold-100 text-gold-700",
};

export default function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
