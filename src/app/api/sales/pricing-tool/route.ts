import { readFile } from "fs/promises";
import path from "path";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { renderSalesPricingToolHtml } from "@/lib/salesPricingToolAccess";

// Serves the pricing/quotes tool's HTML from a private (non-public/) file so
// it only ever reaches someone who has passed the Sales department check —
// unlike a plain public/ static file, which any logged-in user could hit
// directly regardless of role, exposing internal margin/overhead data.
// Forced dynamic + no-store: this response depends on the caller's session,
// so it must never be cached or statically optimized — either would leak
// one user's authorized response to every other caller.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSalesApiAccess();
  if (!session) {
    return new Response("Not authorized", { status: 403 });
  }

  const filePath = path.join(process.cwd(), "src/content/sales-pricing-tool.html");
  const rawHtml = await readFile(filePath, "utf-8");
  // The Profitability & Performance tab and every internal margin/cost-floor/
  // assumption panel are stripped from the response itself for anyone who
  // isn't ADMIN — determined from this request's own authenticated session,
  // never a query param, and never just hidden client-side after shipping.
  const html = renderSalesPricingToolHtml(rawHtml, session.role === "ADMIN");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
