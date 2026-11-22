"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AD_CONSENT_COOKIE } from "@/lib/consentCookie";

function setConsentCookie(value: "granted" | "declined") {
  const oneYear = 60 * 60 * 24 * 365;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AD_CONSENT_COOKIE}=${value}; path=/lead-form; max-age=${oneYear}; SameSite=Lax${secure}`;
}

// Opt-in, not opt-out: shown only while the visitor hasn't yet answered
// (see getAdConsentStatus) — declining or accepting both dismiss it for a
// year via the cookie above. router.refresh() re-runs the server-rendered
// tree on the current page so <MetaPixel> picks up the new consent value
// immediately, without a full page reload. Submitting the quote form
// itself is entirely unaffected by this choice either way.
export default function ConsentBanner() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function choose(value: "granted" | "declined") {
    setConsentCookie(value);
    setDismissed(true);
    router.refresh();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white p-4 shadow-lg">
      <div className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-700">
          We use Meta (Facebook/Instagram) ad tracking to measure how our ads are performing. This
          never affects your quote request — you can decline ad tracking and still submit your
          request normally.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("declined")}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
