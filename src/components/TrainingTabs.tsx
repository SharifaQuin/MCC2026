"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/employees", label: "Employees" },
  { href: "/modules", label: "Modules" },
  { href: "/progress", label: "My Progress" },
  { href: "/glossary", label: "Glossary" },
];

const ADMIN_ONLY_TABS = [
  { href: "/admin/content", label: "Content Editor" },
  { href: "/admin/documents", label: "Onboarding Docs" },
  { href: "/admin/permissions", label: "Permissions" },
];

export default function TrainingTabs({
  isAdmin,
  hideClassicCatalogTabs = false,
}: {
  isAdmin: boolean;
  // While Rookie Journey is the active training mode, the classic
  // 25-module catalog isn't the live curriculum — hide its everyday-nav
  // tabs (Modules, Content Editor) to avoid pointing anyone at content
  // trainees no longer see. /training/content-editor and
  // /admin/rookie-journey (the Rookie-aware equivalents) stay reachable
  // from elsewhere and are unaffected by this.
  hideClassicCatalogTabs?: boolean;
}) {
  const pathname = usePathname();
  const visibleTabs = hideClassicCatalogTabs ? TABS.filter((tab) => tab.href !== "/modules") : TABS;
  const visibleAdminTabs = hideClassicCatalogTabs
    ? ADMIN_ONLY_TABS.filter((tab) => tab.href !== "/admin/content")
    : ADMIN_ONLY_TABS;
  const tabs = isAdmin ? [...visibleTabs, ...visibleAdminTabs] : visibleTabs;

  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? "rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                : "rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
