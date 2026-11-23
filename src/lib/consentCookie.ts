// Just the cookie name — deliberately its own module, with no other
// imports. ConsentBanner ("use client") needs this constant; src/lib/
// consent.ts (which has it too) also imports next/headers for
// getAdConsentStatus, which can never be bundled into a client component.
export const AD_CONSENT_COOKIE = "mcc_ad_consent";
