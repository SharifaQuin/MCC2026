// Whether a Zoom room is configured for recruiting phone interviews.
// Pulled out as its own small, parameterized function (rather than inlined
// where it's used) so it's directly unit-testable with explicit values —
// toggling real environment variables would mean restarting the whole
// server mid-test-run, which isn't possible against a single already-running
// CI/dev server instance.
export function isZoomConfigured(
  pmi: string | undefined = process.env.RECRUITING_ZOOM_PMI,
  link: string | undefined = process.env.RECRUITING_ZOOM_LINK
): boolean {
  return Boolean(pmi || link);
}

export interface ZoomJoinInfo {
  link: string;
  passcode?: string;
}

// The single source of truth for the shared Zoom room's joining details —
// every place that tells anyone (candidate or staff) how to join a Zoom
// interview reads it from here, so the calendar event, the confirmation/
// reminder email, the confirmation/reminder SMS, and the staff-facing
// applicant dashboard can never drift apart. Takes explicit values (same
// reasoning as isZoomConfigured) so it's directly unit-testable without
// restarting the server to change real env vars.
export function getZoomJoinInfo(
  pmi: string | undefined = process.env.RECRUITING_ZOOM_PMI,
  link: string | undefined = process.env.RECRUITING_ZOOM_LINK,
  passcode: string | undefined = process.env.RECRUITING_ZOOM_PASSCODE
): ZoomJoinInfo | null {
  const resolvedLink = pmi ? `https://zoom.us/j/${pmi.replace(/\D/g, "")}` : link;
  if (!resolvedLink) return null;
  return passcode ? { link: resolvedLink, passcode } : { link: resolvedLink };
}
