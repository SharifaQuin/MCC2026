import { readFile } from "fs/promises";
import path from "path";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";

// Serves the Route Day Planner tool's HTML from a private (non-public/) file
// so it only ever reaches someone who has passed the Sales department check
// — mirrors /api/sales/pricing-tool/route.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSalesApiAccess();
  if (!session) {
    return new Response("Not authorized", { status: 403 });
  }

  const filePath = path.join(process.cwd(), "src/content/route-day-planner.html");
  const html = await readFile(filePath, "utf-8");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
