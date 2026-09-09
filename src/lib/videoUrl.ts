// Best-effort fixup for the most common mistake with embedded lesson videos:
// pasting the normal "watch/share" link instead of the actual embed link.
// Those two links often look nearly identical, but the watch link gets
// blocked when shown inside an iframe (the video site's own security
// setting, not something this app can override) — a blank black box with
// no error the app can detect. Recognized hosts get rewritten to their
// embeddable form; anything else is left untouched.
export function normalizeVideoUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;

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

    // Synthesia: share.synthesia.io/<id> (no /embeds/ segment yet) -> /embeds/<id>
    if (parsed.hostname === "share.synthesia.io" && !parsed.pathname.startsWith("/embeds/")) {
      const id = parsed.pathname.replace(/^\/+/, "");
      if (id) return `https://share.synthesia.io/embeds/${id}`;
    }

    // Vimeo: vimeo.com/<id> -> player.vimeo.com/video/<id>
    if (host === "vimeo.com") {
      const id = parsed.pathname.replace(/^\/+/, "");
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }

    return url;
  } catch {
    // Not a valid URL at all — save whatever was typed as-is rather than
    // silently dropping it, so the editor still shows what she entered.
    return url;
  }
}
