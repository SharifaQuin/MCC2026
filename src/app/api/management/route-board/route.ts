import { readFile } from "fs/promises";
import path from "path";
import { requireManagementApiAccess } from "@/lib/requireManagementApiAccess";

// Serves the Management-only Route Board's HTML from a private file so it
// only ever reaches someone who has passed the Management department check
// — mirrors /api/sales/pricing-tool/route.ts, gated by Management instead.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireManagementApiAccess();
  if (!session) {
    return new Response("Not authorized", { status: 403 });
  }

  const filePath = path.join(process.cwd(), "src/content/route-board-internal.html");
  const html = await readFile(filePath, "utf-8");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
