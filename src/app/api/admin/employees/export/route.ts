import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildEmployeeExportCsv } from "@/lib/export";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new NextResponse("Not authorized", { status: 403 });
  }

  const csv = await buildEmployeeExportCsv();
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mcc-employees-${date}.csv"`,
    },
  });
}
