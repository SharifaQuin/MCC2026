"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, TrainingIcon, DocsIcon, ProfileIcon } from "@/components/icons";

interface Tab {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  // A tab is "active" for its own route and everything under it, except
  // Home — "/" would otherwise match every route via the empty-prefix rule.
  matchChildren?: boolean;
}

// Mobile-only (lg:hidden) four-tab bar for the plain employee experience
// (TRAINEE) — additive alongside the existing hamburger drawer in
// MobileNav, not a replacement: every other permitted page (Progress,
// Glossary, Payroll, etc.) stays reachable via that drawer or via a
// shortcut tile on Home/Training themselves. See src/app/(portal)/layout.tsx
// for who gets this rendered at all.
export default function BottomNav({ trainingHref }: { trainingHref: string }) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { href: "/", label: "Home", Icon: HomeIcon },
    { href: trainingHref, label: "Training", Icon: TrainingIcon, matchChildren: true },
    { href: "/documents", label: "Docs", Icon: DocsIcon, matchChildren: true },
    { href: "/account", label: "Profile", Icon: ProfileIcon, matchChildren: true },
  ];

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-brand-700 bg-brand-600 lg:hidden"
    >
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || (tab.matchChildren && pathname.startsWith(tab.href + "/"));
        return (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
              active ? "text-gold-400" : "text-white/70"
            }`}
          >
            <tab.Icon className="h-5 w-5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
