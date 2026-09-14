import { NextResponse } from "next/server";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { buildLeadExportCsv } from "@/lib/leads";

export async function GET() {
  const session = await requireSalesApiAccess();
  if (!session) {
    return new NextResponse("Not authorized", { status: 403 });
  }

  const csv = await buildLeadExportCsv();
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mcc-leads-${date}.csv"`,
    },
  });
}
