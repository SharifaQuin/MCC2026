import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";

// Serves the pricing/quotes tool's HTML from a private (non-public/) file so
// it only ever reaches someone who has passed the Sales department check —
// unlike a plain public/ static file, which any logged-in user could hit
// directly regardless of role, exposing internal margin/overhead data.
// Forced dynamic + no-store: this response depends on the caller's session,
// so it must never be cached or statically optimized — either would leak
// one user's authorized response to every other caller.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("Not authenticated", { status: 401 });
  }

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const { canView } = hasDepartmentAccess(session.role, grants, "SALES");
  if (!canView) {
    return new Response("Not authorized", { status: 403 });
  }

  const filePath = path.join(process.cwd(), "src/content/sales-pricing-tool.html");
  const html = await readFile(filePath, "utf-8");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
