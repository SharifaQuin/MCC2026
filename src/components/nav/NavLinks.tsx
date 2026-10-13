"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/navigation";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

// Shared by the desktop sidebar and the mobile drawer so the two can never
// show different links for the same session — only the surrounding chrome
// differs.
export default function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
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
                        ? "bg-brand-50 text-brand-700"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
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
      ))}
    </nav>
  );
}
