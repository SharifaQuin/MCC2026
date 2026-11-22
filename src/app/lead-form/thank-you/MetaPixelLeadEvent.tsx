"use client";

import { useEffect } from "react";

const STORAGE_KEY_PREFIX = "mcc_meta_lead_fired_";

// Fires Meta's standard Lead event exactly once per successfully-saved
// lead. leadId is only ever set on the redirect after prisma.lead.create()
// actually succeeds (see submitLeadAction) — the honeypot/duplicate-active/
// reopened-Unable-to-Contact branches never pass one, so this component
// simply never mounts with a real id for those cases.
//
// Duplicate protection: a refresh, back/forward navigation, or revisiting
// this exact thank-you URL later would otherwise re-fire the event for the
// same lead — localStorage (not sessionStorage, so it survives even a
// closed tab) remembers this specific lead id has already fired and skips
// it on every subsequent mount.
export default function MetaPixelLeadEvent({ leadId }: { leadId: string }) {
  useEffect(() => {
    if (!leadId) return;

    const storageKey = STORAGE_KEY_PREFIX + leadId;
    try {
      if (window.localStorage.getItem(storageKey)) return;
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // localStorage unavailable (private browsing, blocked storage, etc.)
      // — fail open rather than silently losing a real conversion; the
      // worst case here is a rare double-count, not a missing event.
    }

    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    // No custom data object — the event itself carries no personal or
    // business detail, only that a lead was saved.
    fbq?.("track", "Lead");
  }, [leadId]);

  return null;
}
