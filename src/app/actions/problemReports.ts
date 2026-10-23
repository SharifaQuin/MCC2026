"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ProblemReportCategory, ProblemReportFeedbackOutcome } from "@prisma/client";
import { getSession } from "@/lib/session";
import {
  submitProblemReport,
  resolveProblemReport,
  reopenProblemReport,
  submitProblemReportFeedback,
  type ActionResult,
} from "@/lib/problemReports";

function revalidateProblemReportViews(reportId: string) {
  revalidatePath("/owner/problem-reports");
  revalidatePath("/my-reports");
  revalidatePath(`/my-reports/${reportId}`);
}

export async function submitProblemReportAction(category: ProblemReportCategory, description: string) {
  await submitProblemReport(category, description);
}

export async function resolveProblemReportAction(id: string, note: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  const result = await resolveProblemReport(session, id, note);
  revalidateProblemReportViews(id);
  return result;
}

export async function reopenProblemReportAction(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  const result = await reopenProblemReport(session, id);
  revalidateProblemReportViews(id);
  return result;
}

export async function submitProblemReportFeedbackAction(
  reportId: string,
  expectedResolutionId: string | null,
  outcome: ProblemReportFeedbackOutcome,
  note: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  const result = await submitProblemReportFeedback(session, reportId, expectedResolutionId, outcome, note);
  revalidateProblemReportViews(reportId);
  return result;
}
