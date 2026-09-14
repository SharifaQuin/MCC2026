"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { PayReviewDecision } from "@prisma/client";

export interface PayReviewAssessmentState {
  error?: string;
  success?: boolean;
}

// A pay review is comp data end to end — ADMIN-only, unlike Promotion
// Assessments where a SERVICE_MANAGER can see/create everything but the
// pay differential.
async function requirePayReviewAdminAccess() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(employeeId: string) {
  revalidatePath(`/staff/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
}

const VALID_DECISIONS = new Set(["APPROVED", "DENIED", "DEFERRED"]);

export async function createPayReviewAssessmentAction(
  employeeId: string,
  _prevState: PayReviewAssessmentState,
  formData: FormData
): Promise<PayReviewAssessmentState> {
  let session;
  try {
    session = await requirePayReviewAdminAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const currentPayRaw = String(formData.get("currentPay") ?? "").trim();
  const recommendedPayRaw = String(formData.get("recommendedPay") ?? "").trim();
  const justification = String(formData.get("justification") ?? "").trim();
  const decisionRaw = String(formData.get("decision") ?? "");
  const decision = VALID_DECISIONS.has(decisionRaw) ? (decisionRaw as PayReviewDecision) : null;
  const effectiveDateRaw = String(formData.get("effectiveDate") ?? "");

  const currentPay = Number(currentPayRaw);
  const recommendedPay = Number(recommendedPayRaw);

  if (!currentPayRaw || !recommendedPayRaw || Number.isNaN(currentPay) || Number.isNaN(recommendedPay)) {
    return { error: "Please enter valid current and recommended pay rates." };
  }
  if (!justification) {
    return { error: "Please provide a justification for this review." };
  }
  if (!decision) {
    return { error: "Please choose a decision." };
  }
  if (decision === "APPROVED" && !effectiveDateRaw) {
    return { error: "An Approved decision requires an effective date." };
  }
  const effectiveDate = effectiveDateRaw ? new Date(effectiveDateRaw) : null;

  const assessment = await prisma.payReviewAssessment.create({
    data: {
      employeeId,
      currentPay,
      recommendedPay,
      justification,
      decision,
      effectiveDate: decision === "APPROVED" ? effectiveDate : null,
      reviewedById: session.sub,
    },
  });

  // An Approved decision auto-generates a linked draft PAY_CHANGE PAF — the
  // assessment is the evaluation, the PAF is the execution record that
  // actually authorizes payroll to act.
  if (decision === "APPROVED") {
    await prisma.personnelActionForm.create({
      data: {
        employeeId,
        actionType: "PAY_CHANGE",
        effectiveDate: effectiveDate!,
        priorPay: currentPay,
        newPay: recommendedPay,
        reason: `Auto-generated from an Approved decision on a Pay Review. ${justification}`,
        linkedPayReviewId: assessment.id,
        createdById: session.sub,
      },
    });
  }

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function deletePayReviewAssessmentAction(assessmentId: string, employeeId: string) {
  await requirePayReviewAdminAccess();
  await prisma.payReviewAssessment.delete({ where: { id: assessmentId } });
  revalidateEmployeeViews(employeeId);
}
