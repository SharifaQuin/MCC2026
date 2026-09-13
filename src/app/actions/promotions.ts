"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { TARGET_ROLE_LABELS } from "@/lib/promotions";
import type { PromotionTargetRole, PromotionDecision } from "@prisma/client";

export interface PromotionAssessmentState {
  error?: string;
  success?: boolean;
}

async function requireHrAccess() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(employeeId: string) {
  revalidatePath(`/staff/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
}

const VALID_TARGET_ROLES = new Set(["ASSISTANT", "LEAD", "TRAINER"]);
const VALID_DECISIONS = new Set(["PROMOTE", "DEVELOP", "STAY", "ADDRESS"]);

// payDifferential is ADMIN-only — a SERVICE_MANAGER's submission simply never
// has it read from formData, rather than being hidden-but-trusted client
// side; this is the real permission check the field needs.
export async function createPromotionAssessmentAction(
  employeeId: string,
  _prevState: PromotionAssessmentState,
  formData: FormData
): Promise<PromotionAssessmentState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const targetRoleRaw = String(formData.get("targetRole") ?? "");
  const targetRole = VALID_TARGET_ROLES.has(targetRoleRaw) ? (targetRoleRaw as PromotionTargetRole) : null;
  const decisionRaw = String(formData.get("decision") ?? "");
  const decision = VALID_DECISIONS.has(decisionRaw) ? (decisionRaw as PromotionDecision) : null;
  const developmentPlan = String(formData.get("developmentPlan") ?? "").trim() || null;
  const reassessmentDateRaw = String(formData.get("reassessmentDate") ?? "");
  const reassessmentDate = reassessmentDateRaw ? new Date(reassessmentDateRaw) : null;
  const indicatorsRaw = String(formData.get("readinessIndicatorsJson") ?? "[]");

  if (!targetRole || !decision) {
    return { error: "Please choose a target role and a decision." };
  }

  let readinessIndicators: { label: string; met: boolean }[];
  try {
    readinessIndicators = JSON.parse(indicatorsRaw);
  } catch {
    return { error: "Readiness indicator data was malformed — please try again." };
  }

  if (decision === "DEVELOP" && (!developmentPlan || !reassessmentDate)) {
    return { error: "A Develop decision requires a development plan and a reassessment date." };
  }

  let payDifferential: number | null = null;
  if (session.role === "ADMIN") {
    const raw = String(formData.get("payDifferential") ?? "").trim();
    if (raw) {
      payDifferential = Number(raw);
      if (Number.isNaN(payDifferential)) {
        return { error: "Pay differential must be a number." };
      }
    }
  }

  const assessment = await prisma.promotionAssessment.create({
    data: {
      employeeId,
      targetRole,
      readinessIndicators,
      decision,
      developmentPlan: decision === "DEVELOP" ? developmentPlan : null,
      reassessmentDate: decision === "DEVELOP" ? reassessmentDate : null,
      payDifferential,
      assessedById: session.sub,
    },
  });

  // A "Promote" decision auto-generates a linked draft PAF — the assessment
  // is the evaluation, the PAF is the execution record that actually
  // authorizes payroll to act. This app doesn't track a base pay rate, so
  // newPay is left for whoever approves the PAF to fill in; the approved
  // differential (if any) is preserved in the reason text either way.
  if (decision === "PROMOTE") {
    await prisma.personnelActionForm.create({
      data: {
        employeeId,
        actionType: "PROMOTION",
        effectiveDate: new Date(),
        newTitle: TARGET_ROLE_LABELS[targetRole],
        reason:
          `Auto-generated from a Promote decision on a Promotion Assessment.` +
          (payDifferential !== null ? ` Approved pay differential: +$${payDifferential.toFixed(2)}/hr.` : ""),
        linkedAssessmentId: assessment.id,
        createdById: session.sub,
      },
    });
  }

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function deletePromotionAssessmentAction(assessmentId: string, employeeId: string) {
  await requireHrAccess();
  await prisma.promotionAssessment.delete({ where: { id: assessmentId } });
  revalidateEmployeeViews(employeeId);
}
