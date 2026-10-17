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
