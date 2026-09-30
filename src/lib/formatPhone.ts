// Formats a US phone number for display as "(555) 123-4567" so the area
// code and exchange are visually separated, regardless of how it was
// originally typed in (raw digits, dash-separated, with a leading "1",
// etc. — this app has no input-time normalization, so stored values vary).
// Anything that isn't a clean 10-digit US number (or 11 digits with a
// leading country code "1") is returned unchanged rather than mangled.
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return raw ?? null;

  const digits = raw.replace(/\D/g, "");
  const tenDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (tenDigits.length !== 10) return raw;

  return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}
