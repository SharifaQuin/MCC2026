import Link from "next/link";
import Logo from "@/components/Logo";
import NavLinks from "@/components/nav/NavLinks";
import SettingsGear from "@/components/nav/SettingsGear";
import type { NavGroup } from "@/lib/navigation";
import type { Language } from "@/lib/session";

// Persistent left column, desktop only (the mobile drawer in MobileNav.tsx
// renders the same NavLinks groups in a different shell). Hidden below the
// lg breakpoint via CSS, never unmounted, so there's exactly one source of
// nav state regardless of viewport.
export default function Sidebar({
  name,
  language,
  showLanguageToggle,
  groups,
}: {
  name: string;
  language: Language;
  showLanguageToggle: boolean;
  groups: NavGroup[];
}) {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-brand-600 lg:flex"
      data-testid="desktop-sidebar"
    >
      <div className="flex h-16 items-center border-b border-white/10 px-4">
        <Link href="/">
          <Logo light />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks groups={groups} onDark />
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
        <span className="truncate text-sm font-medium text-white/90">{name}</span>
        <SettingsGear
          name={name}
          language={language}
          showLanguageToggle={showLanguageToggle}
          dropDirection="up"
          align="left"
          buttonClassName="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
        />
      </div>
    </aside>
  );
}
