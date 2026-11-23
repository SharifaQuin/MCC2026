// A small, consistent set of stroke-based icons used across the nav,
// shortcut cards, and stat tiles — replaces any ad hoc per-feature icon
// with one shared visual language. All accept a className (for sizing via
// text/currentColor) and default to a 20x20 box.
type IconProps = { className?: string };

function base(path: React.ReactNode, props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className ?? "h-5 w-5"}
    >
      {path}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </>,
    props
  );
}

export function TrainingIcon(props: IconProps) {
  return base(
    <>
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
      <path d="M7 10.8v4.2c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.2" />
      <path d="M20 9v5" />
    </>,
    props
  );
}

export function DocsIcon(props: IconProps) {
  return base(
    <>
      <path d="M8 3h5l5 5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V4.5A1.5 1.5 0 0 1 7.5 3Z" />
      <path d="M13 3v5h5" />
      <path d="M9 13h6M9 16.5h6" />
    </>,
    props
  );
}

export function ProfileIcon(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="8.3" r="3.3" />
      <path d="M5 19.5c1.3-3 4-4.5 7-4.5s5.7 1.5 7 4.5" />
    </>,
    props
  );
}

export function KeyIcon(props: IconProps) {
  return base(
    <>
      <circle cx="8" cy="15.5" r="3.5" />
      <path d="M10.5 13 18 5.5M16 7.5l2 2M18.5 5l2 2" />
    </>,
    props
  );
}

export function GlobeIcon(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.3 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.3-3.5-8.5s1.2-6.2 3.5-8.5Z" />
    </>,
    props
  );
}

export function BookIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </>,
    props
  );
}

export function FlagIcon(props: IconProps) {
  return base(
    <>
      <path d="M6 20V4" />
      <path d="M6 5h11l-2.5 3.5L17 12H6" />
    </>,
    props
  );
}

export function SignOutIcon(props: IconProps) {
  return base(
    <>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M15 16l4-4-4-4" />
      <path d="M19 12H9" />
    </>,
    props
  );
}

export function ChartIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 17v-4M12.5 17V8M17 17v-7" />
    </>,
    props
  );
}

export function BriefcaseIcon(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="7.5" width="17" height="11" rx="1.5" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
      <path d="M3.5 12.5h17" />
    </>,
    props
  );
}

export function DollarIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 3v18" />
      <path d="M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1-4.5 2.6c0 3.9 9 1.7 9 5.9 0 1.8-2 3-4.5 3s-4.5-1.3-4.5-3" />
    </>,
    props
  );
}

export function PeopleIcon(props: IconProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c.9-2.7 3.1-4 6-4s5.1 1.3 6 4" />
      <circle cx="17.5" cy="9" r="2.3" />
      <path d="M15.8 11.6c2 .2 3.6 1.4 4.2 3.4" />
    </>,
    props
  );
}

export function BuildingIcon(props: IconProps) {
  return base(
    <>
      <rect x="5" y="3.5" width="9" height="17" rx="1" />
      <path d="M14 10h5v9.5a1 1 0 0 1-1 1h-4" />
      <path d="M8 7.5h1M11 7.5h1M8 11h1M11 11h1M8 14.5h1M11 14.5h1" />
    </>,
    props
  );
}

export function ToolboxIcon(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="9" width="17" height="10" rx="1.5" />
      <path d="M8 9V6.5A1.5 1.5 0 0 1 9.5 5h5A1.5 1.5 0 0 1 16 6.5V9" />
      <path d="M3.5 13.5h17" />
    </>,
    props
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 3.5 5 6v6c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5V6Z" />
      <path d="M9 12l2 2 4-4" />
    </>,
    props
  );
}

export function EditIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 20h4L19.5 8.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16Z" />
      <path d="M13.5 6.5l4 4" />
    </>,
    props
  );
}

export function CalendarIcon(props: IconProps) {
  return base(
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="1.5" />
      <path d="M4 10h16M8 3.5v4M16 3.5v4" />
    </>,
    props
  );
}

export function PhoneCallIcon(props: IconProps) {
  return base(
    <path d="M5 4.5h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A14.5 14.5 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5Z" />,
    props
  );
}

export function ClipboardListIcon(props: IconProps) {
  return base(
    <>
      <rect x="6" y="4" width="12" height="16.5" rx="1.5" />
      <path d="M9 3.5h6a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5H9a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M9 11h6M9 14.5h6M9 8h2" />
    </>,
    props
  );
}

export function TargetIcon(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>,
    props
  );
}

export function AlertIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 4.5 21 19.5H3Z" />
      <path d="M12 10v4M12 16.5h.01" />
    </>,
    props
  );
}

export function ChevronRightIcon(props: IconProps) {
  return base(<path d="M9 5l7 7-7 7" />, props);
}
