"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import NavLinks from "@/components/nav/NavLinks";
import SettingsGear from "@/components/nav/SettingsGear";
import { getPageTitle, type NavGroup } from "@/lib/navigation";
import { t } from "@/lib/i18n";
import type { Language } from "@/lib/session";

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled])';

export default function MobileNav({
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
  const labels = t(language);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const pageTitle = getPageTitle(pathname, groups, language);

  function close() {
    setOpen(false);
    menuButtonRef.current?.focus();
  }

  // Close the drawer whenever the route actually changes (covers the back
  // button / a link opened in a way NavLinks' own onNavigate wouldn't catch).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    const focusable = drawer ? Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
    focusable[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab" && drawer) {
        const nodes = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="lg:hidden" data-testid="mobile-nav">
      <div className="flex h-14 items-center gap-2 border-b border-neutral-200 bg-white px-3">
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={labels.navOpenMenu}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-md p-2 text-neutral-600 hover:bg-neutral-100"
        >
          <HamburgerIcon />
        </button>
        <Link href="/" className="shrink-0">
          <Logo iconOnly />
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-700">{pageTitle}</p>
        <SettingsGear name={name} language={language} showLanguageToggle={showLanguageToggle} />
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={close}
            aria-hidden="true"
            data-testid="nav-drawer-overlay"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={labels.navOpenMenu}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-100 px-4">
              <Logo size="sm" />
              <button
                type="button"
                aria-label={labels.navCloseMenu}
                onClick={close}
                className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavLinks groups={groups} onNavigate={close} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
