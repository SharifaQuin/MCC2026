"use server";

import { revalidatePath } from "next/cache";
import type { ProblemReportCategory } from "@prisma/client";
import { submitProblemReport, setProblemReportStatus } from "@/lib/problemReports";

export async function submitProblemReportAction(category: ProblemReportCategory, description: string) {
  await submitProblemReport(category, description);
}

export async function setProblemReportStatusAction(id: string, status: "OPEN" | "RESOLVED") {
  await setProblemReportStatus(id, status);
  revalidatePath("/owner/problem-reports");
}
