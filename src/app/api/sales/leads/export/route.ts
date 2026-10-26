import { NextResponse } from "next/server";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { buildLeadExportCsv } from "@/lib/leads";

// ?filtered=1 excludes Scam-classified leads, matching the app's normal
// working view; the default (no param) is the "all-received" export —
// every lead that ever came in. The filename always says which one a
// download actually is, so neither can be mistaken for the other.
export async function GET(request: Request) {
  const session = await requireSalesApiAccess();
  if (!session) {
    return new NextResponse("Not authorized", { status: 403 });
  }

  const filtered = new URL(request.url).searchParams.get("filtered") === "1";
  const csv = await buildLeadExportCsv({ excludeScam: filtered });
  const date = new Date().toISOString().slice(0, 10);
  const suffix = filtered ? "filtered" : "all-received";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mcc-leads-${suffix}-${date}.csv"`,
    },
  });
}
