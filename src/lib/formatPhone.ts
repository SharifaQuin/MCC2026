// Formats a US phone number for display as "(555) 123-4567" so the area
// code and exchange are visually separated, regardless of how it was
// originally typed in (raw digits, dash-separated, with a leading "1",
// etc. — this app has no input-time normalization, so stored values vary).
// Anything that isn't a clean 10-digit US number (or 11 digits with a
// leading country code "1") is returned unchanged rather than mangled.
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return raw ?? null;

  const tenDigits = stripUsCountryCode(raw.replace(/\D/g, ""));
  if (tenDigits.length !== 10) return raw;

  return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}

function stripUsCountryCode(digits: string): string {
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

// Digits-only form(s) of a phone number, for *comparing* two numbers typed
// in different formats as the same number (dashes/parens/spaces, with or
// without a leading "1") — not for display, see formatPhone above for that.
// Returns both the as-typed digit string and, when it looks like it has a
// US country code prefix, the 10-digit form without it, so a caller can
// match against either without having to know which form the other side
// used. The results are a Set since the two can be identical.
export function normalizePhoneDigits(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return new Set();
  return new Set([digits, stripUsCountryCode(digits)]);
}
