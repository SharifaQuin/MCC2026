import { cookies } from "next/headers";
import { AD_CONSENT_COOKIE } from "@/lib/consentCookie";

export { AD_CONSENT_COOKIE };

// Visitor's own choice about Meta (Facebook/Instagram) ad tracking on the
// public lead form — entirely separate from submitting a quote request,
// which always works the same regardless of this choice. "unset" means
// the visitor hasn't been asked yet (or hasn't answered) — the Pixel
// stays off (opt-in, not opt-out) until it's explicitly "granted".
export type AdConsentStatus = "granted" | "declined" | "unset";

export function getAdConsentStatus(): AdConsentStatus {
  const value = cookies().get(AD_CONSENT_COOKIE)?.value;
  return value === "granted" || value === "declined" ? value : "unset";
}
