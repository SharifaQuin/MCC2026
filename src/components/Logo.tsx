interface LogoProps {
  size?: "sm" | "lg";
  withTagline?: boolean;
  className?: string;
  // The slim mobile top bar has no room for the full wordmark alongside a
  // menu button, page name, and gear — just the icon still reads as "MCC
  // branding" without risking horizontal overflow at 390px.
  iconOnly?: boolean;
  // For use on a navy (brand-600/700) background — e.g. the desktop
  // sidebar — where the wordmark's usual dark-navy text would disappear.
  // The icon itself is already two-tone (gold outline / navy heart) and
  // reads fine on light or dark backgrounds unchanged.
  light?: boolean;
}

export default function Logo({
  size = "sm",
  withTagline = false,
  className = "",
  iconOnly = false,
  light = false,
}: LogoProps) {
  const iconSize = size === "lg" ? 56 : 32;
  const nameSize = size === "lg" ? "text-2xl" : "text-base";

  const icon = (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M18 62 L18 34 L50 12 L82 34 L82 62"
        stroke="#C9A227"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M50 56 C41 47 32 42 32 32 C32 25 39 21 44 26 C47 29 50 32 50 32 C50 32 53 29 56 26 C61 21 68 25 68 32 C68 42 59 47 50 56 Z"
        fill="#1B2A4A"
      />
    </svg>
  );

  if (iconOnly) {
    return (
      <div className={`flex items-center ${className}`} aria-label="Mama's Cleaning Crew">
        {icon}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {icon}
      <div className="leading-tight">
        <p className={`font-semibold tracking-tight ${light ? "text-white" : "text-brand-700"} ${nameSize}`}>
          Mama&apos;s Cleaning Crew
        </p>
        {withTagline && (
          <p className={`text-sm font-medium uppercase tracking-wide ${light ? "text-gold-400" : "text-gold-600"}`}>
            Team Portal
          </p>
        )}
      </div>
    </div>
  );
}
