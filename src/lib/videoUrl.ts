// Best-effort fixup for the two most common mistakes with embedded lesson
// videos: (1) pasting the whole <iframe> embed snippet a video site gives
// you (e.g. Synthesia's "Embed" tab hands you full HTML, not a bare link),
// and (2) pasting the normal "watch/share" link instead of the actual embed
// link. A watch/share link gets silently blocked when shown inside another
// site's iframe (the video site's own security setting, not something this
// app can override) — a blank black box with no error the app can detect.
// Recognized hosts get rewritten to their embeddable form; anything else is
// left untouched.
export function normalizeVideoUrl(raw: string): string | null {
  let url = raw.trim();
  if (!url) return null;

  // If a full <iframe> embed snippet was pasted, pull the src="..." out of
  // it and work with that instead of the surrounding HTML.
  const iframeSrcMatch = url.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (iframeSrcMatch) url = iframeSrcMatch[1];

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    // YouTube: watch?v=<id> or youtu.be/<id> -> embed/<id>
    if (host === "youtube.com" && parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }

    // Synthesia's real embed form is share.synthesia.io/embeds/videos/<id>
    // (confirmed against an actual embed snippet from Synthesia). Take
    // whatever the last path segment is as the id and rebuild from there,
    // so this handles the plain share link, a /videos/<id> share link, etc.
    if (parsed.hostname === "share.synthesia.io") {
      if (parsed.pathname.startsWith("/embeds/videos/")) {
        return url; // already correct
      }
      const segments = parsed.pathname.split("/").filter(Boolean);
      const id = segments[segments.length - 1];
      if (id) return `https://share.synthesia.io/embeds/videos/${id}`;
    }

    // Vimeo: vimeo.com/<id> -> player.vimeo.com/video/<id>
    if (host === "vimeo.com") {
      const id = parsed.pathname.replace(/^\/+/, "");
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }

    // Loom: loom.com/share/<id> -> loom.com/embed/<id>
    if (host === "loom.com" && parsed.pathname.startsWith("/share/")) {
      const id = parsed.pathname.replace(/^\/share\//, "");
      if (id) return `https://www.loom.com/embed/${id}`;
    }

    return url;
  } catch {
    // Not a valid URL at all (and no <iframe src> was found inside it) —
    // save whatever was typed as-is rather than silently dropping it, so
    // the editor still shows what she entered.
    return url;
  }
}
