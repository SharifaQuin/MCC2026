"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/navigation";
import {
  BuildingIcon,
  TrainingIcon,
  DocsIcon,
  PeopleIcon,
  DollarIcon,
  ToolboxIcon,
  BriefcaseIcon,
  ShieldCheckIcon,
  EditIcon,
  ChartIcon,
} from "@/components/icons";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

// One icon per nav GROUP (not per link) — enough to give every section a
// distinct, consistent visual identity without per-link icon bloat. Keyed
// by NavGroup.key from buildNavGroups(), so adding/renaming a group's links
// there never needs a matching change here; only a brand-new group key
// needs an entry (falls back to a generic icon otherwise).
const GROUP_ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  departments: BuildingIcon,
  training: TrainingIcon,
  "pay-documents": DocsIcon,
  team: PeopleIcon,
  "sales-work": DollarIcon,
  "business-tools": ToolboxIcon,
  "work-areas": BriefcaseIcon,
  management: ShieldCheckIcon,
  "training-content-editor": EditIcon,
};

// Shared by the desktop sidebar (navy background) and the mobile drawer
// (white background) so the two can never show different links for the
// same session — only the surrounding chrome differs. `onDark` picks the
// matching text/active-state colors for whichever background the caller
// actually uses; getting this wrong is exactly what produced unreadable
// white-on-white links in the drawer, so it's a required prop, not a
// default, to force every caller to state its own background explicitly.
export default function NavLinks({
  groups,
  onNavigate,
  onDark,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
  onDark: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5">
      {groups.map((group) => {
        const GroupIcon = GROUP_ICONS[group.key] ?? ChartIcon;
        return (
          <div key={group.key}>
            <p
              className={`mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide ${
                onDark ? "text-gold-400/90" : "text-neutral-500"
              }`}
            >
              <GroupIcon className="h-3.5 w-3.5" />
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? onDark
                            ? "bg-gold-500 text-brand-900"
                            : "bg-brand-50 text-brand-700"
                          : onDark
                            ? "text-white/80 hover:bg-white/10 hover:text-white"
                            : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                      }`}
                    >
                      <span className="truncate">{link.label}</span>
                      {!!link.badge && (
                        <span className="ml-2 inline-flex shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                          {link.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
