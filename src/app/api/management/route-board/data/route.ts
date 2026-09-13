import { prisma } from "@/lib/prisma";
import { requireManagementApiAccess } from "@/lib/requireManagementApiAccess";

// Read-only peek at the Route Day Planner's shared 'logged leads' data so
// the Management-only route board can recompute live counts, without
// granting Management the general Sales tool storage read/write access
// that /api/sales/storage exposes.
export const dynamic = "force-dynamic";

const ROUTE_STORAGE_KEY = "route-planner:logged-leads";

export async function GET() {
  const session = await requireManagementApiAccess();
  if (!session) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const row = await prisma.salesToolData.findUnique({ where: { key: ROUTE_STORAGE_KEY } });
  return Response.json({ value: row?.value ?? null });
}
