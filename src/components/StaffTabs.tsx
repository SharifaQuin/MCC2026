"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/staff", label: "Directory" },
  { href: "/staff/payroll", label: "Payroll" },
];

export default function StaffTabs() {
  const pathname = usePathname();
  const onPayrollTab = pathname.startsWith("/staff/payroll");

  return (
    <div className="flex flex-wrap gap-3">
      {TABS.map((tab) => {
        const active =
          tab.href === "/staff/payroll"
            ? onPayrollTab
            : pathname === tab.href || (pathname.startsWith(tab.href + "/") && !onPayrollTab);
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
