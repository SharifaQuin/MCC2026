"use client";

import { useEffect } from "react";
import type { AdConsentStatus } from "@/lib/consent";

const STORAGE_KEY_PREFIX = "mcc_meta_lead_fired_";

// Fires Meta's standard Lead event at most once per successfully-saved
// lead — and only once the visitor has actually granted ad-tracking
// consent (see ConsentBanner/src/lib/consent.ts). While consent is
// "unset" or "declined" this does nothing at all — deliberately not even
// consuming the cookie below yet, so a visitor who answers the consent
// banner a moment AFTER landing here (same page, consent flips to
// "granted" via router.refresh()) still gets their Lead event, instead of
// it being silently lost because something else already consumed it.
//
// Duplicate protection is server-side first: POSTing to
// /lead-form/api/consume-lead-cookie reads AND deletes the short-lived
// mcc_last_lead_id cookie in the same request (see that route) — the
// cookie only exists at all on the one redirect after a genuine new lead
// was saved (submitLeadAction), and whichever request reads it first
// consumes it, so a reload of this exact page (or this effect re-running
// for any other reason) gets leadId: null back the second time and never
// re-fires. A per-lead-id localStorage check is kept underneath as a free
// second guard, but the route's one-time consumption is what actually
// prevents a false/duplicate event after a reload.
export default function MetaPixelLeadEvent({ consent }: { consent: AdConsentStatus }) {
  useEffect(() => {
    if (consent !== "granted") return;

    fetch("/lead-form/api/consume-lead-cookie", { method: "POST", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ leadId: string | null }>) : null))
      .then((data) => {
        const leadId = data?.leadId;
        if (!leadId) return;

        const storageKey = STORAGE_KEY_PREFIX + leadId;
        try {
          if (window.localStorage.getItem(storageKey)) return;
          window.localStorage.setItem(storageKey, "1");
        } catch {
          // localStorage unavailable (private browsing, blocked storage,
          // etc.) — fail open; the route's one-time cookie consumption
          // above is the real guard against a duplicate fire.
        }

        const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
        // No custom data object — the event itself carries no personal or
        // business detail, only that a lead was saved.
        fbq?.("track", "Lead");
      })
      .catch(() => {
        // Network hiccup talking to our own API — fail closed, no event.
      });
  }, [consent]);

  return null;
}
