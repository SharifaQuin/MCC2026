"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/invite", label: "Invite Employee" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/modules", label: "Modules" },
  { href: "/progress", label: "My Progress" },
  { href: "/glossary", label: "Glossary" },
];

const ADMIN_ONLY_TABS = [
  { href: "/admin/content", label: "Content Editor" },
  { href: "/admin/permissions", label: "Permissions" },
];

export default function TrainingTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...TABS, ...ADMIN_ONLY_TABS] : TABS;

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
