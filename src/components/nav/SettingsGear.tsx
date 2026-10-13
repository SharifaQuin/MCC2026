"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import type { Language } from "@/lib/session";
import { setLanguageAction } from "@/app/actions/language";

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19.4a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4.6a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10.5a1.65 1.65 0 0 0 1-1.51V2.6a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21.4a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SettingsGear({
  name,
  language,
  showLanguageToggle,
  dropDirection = "down",
  align = "right",
  buttonClassName = "rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700",
}: {
  name: string;
  language: Language;
  showLanguageToggle: boolean;
  dropDirection?: "up" | "down";
  // The sidebar's gear sits near the left edge of a narrow column, so its
  // menu must open rightward (align="left", anchored to the button's left
  // edge) or it overflows past the sidebar/viewport edge; the mobile top
  // bar's gear sits at the far right of a wide-enough row, where opening
  // leftward (align="right", the default) is what keeps it on-screen.
  align?: "left" | "right";
  buttonClassName?: string;
}) {
  const labels = t(language);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="settings-gear"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={labels.navSettings}
        onClick={() => setOpen((s) => !s)}
        className={buttonClassName}
      >
        <GearIcon />
      </button>

      {open && (
        <div
          data-testid="settings-menu"
          className={`absolute z-30 w-64 rounded-md border border-neutral-200 bg-white py-1 shadow-lg ${
            align === "left" ? "left-0" : "right-0"
          } ${dropDirection === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <p className="truncate border-b border-neutral-100 px-3 py-2 text-xs text-neutral-500">
            {labels.navSignedInAs} <span className="font-medium text-neutral-800">{name}</span>
          </p>

          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            {labels.myAccount}
          </Link>

          <Link
            href="/help"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            {labels.navHelpPolicies}
          </Link>

          {showLanguageToggle && (
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm text-neutral-700">EN / ES</span>
              <div className="flex gap-1">
                <form action={setLanguageAction.bind(null, "EN")}>
                  <button
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      language === "EN" ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    EN
                  </button>
                </form>
                <form action={setLanguageAction.bind(null, "ES")}>
                  <button
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      language === "ES" ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    ES
                  </button>
                </form>
              </div>
            </div>
          )}

          <Link
            href="/report-a-problem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            {labels.navReportProblem}
          </Link>

          <form action="/logout" method="POST" className="border-t border-neutral-100">
            <button
                className="block w-full px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50"
            >
              {labels.logout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
