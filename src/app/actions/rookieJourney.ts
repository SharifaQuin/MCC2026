"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { recordFieldCheckoff } from "@/lib/rookieJourney";
import type { FieldSkillRating, RookieDay3Decision, RookieDay10Decision, SealDecision } from "@prisma/client";

// Same gate as the existing certification/field-eval actions — this
// feature reuses those role boundaries rather than inventing new ones.
async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
  return session;
}

async function requireTrainerOrAdmin() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TRAINER" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(traineeId: string) {
  revalidatePath(`/admin/employees/${traineeId}`);
  revalidatePath(`/trainer/employees/${traineeId}`);
  revalidatePath(`/trainer/employees/${traineeId}/checkoff`);
  revalidatePath("/");
}

// ── Admin: Rookie Day content ──

export async function updateRookieDayContentAction(dayNumber: number, formData: FormData) {
  await requireAdmin();
  const field = (name: string) => String(formData.get(name) ?? "").trim();

  await prisma.rookieDay.update({
    where: { dayNumber },
    data: {
      titleEn: field("titleEn"),
      titleEs: field("titleEs"),
      descriptionEn: field("descriptionEn"),
      descriptionEs: field("descriptionEs"),
      estimatedAcademyMinutes: Number(field("estimatedAcademyMinutes")) || 0,
      fieldGoalEn: field("fieldGoalEn") || null,
      fieldGoalEs: field("fieldGoalEs") || null,
    },
  });
  revalidatePath("/admin/rookie-journey");
  revalidatePath("/");
}

// Assigns a lesson to a Rookie Day, to the Knowledge Library, or clears its
// assignment entirely (dayNumber null + slot null) — never touches the
// Lesson row itself.
export async function setLessonAssignmentAction(
  lessonId: string,
  target: { dayNumber: number | null; slot: "ROOKIE_DAY" | "KNOWLEDGE_LIBRARY" | null }
) {
  await requireAdmin();

  if (target.slot === null) {
    await prisma.rookieLessonAssignment.deleteMany({ where: { lessonId } });
  } else {
    const rookieDayId =
      target.slot === "ROOKIE_DAY" && target.dayNumber
        ? (await prisma.rookieDay.findUnique({ where: { dayNumber: target.dayNumber }, select: { id: true } }))?.id ??
          null
        : null;

    const existing = await prisma.rookieLessonAssignment.findUnique({ where: { lessonId } });
    const nextOrder = rookieDayId
      ? (await prisma.rookieLessonAssignment.count({ where: { rookieDayId } })) + 1
      : 0;

    if (existing) {
      await prisma.rookieLessonAssignment.update({
        where: { lessonId },
        data: { rookieDayId, slot: target.slot, order: existing.rookieDayId === rookieDayId ? existing.order : nextOrder },
      });
    } else {
      await prisma.rookieLessonAssignment.create({
        data: { lessonId, rookieDayId, slot: target.slot, order: nextOrder },
      });
    }
  }

  revalidatePath("/admin/rookie-journey");
  revalidatePath("/");
}

export async function moveLessonAssignmentAction(assignmentId: string, direction: "up" | "down") {
  await requireAdmin();
  const current = await prisma.rookieLessonAssignment.findUnique({ where: { id: assignmentId } });
  if (!current || !current.rookieDayId) return;

  const siblings = await prisma.rookieLessonAssignment.findMany({
    where: { rookieDayId: current.rookieDayId },
    orderBy: { order: "asc" },
  });
  const idx = siblings.findIndex((s) => s.id === assignmentId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return;

  const a = siblings[idx];
  const b = siblings[swapIdx];
  await prisma.$transaction([
    prisma.rookieLessonAssignment.update({ where: { id: a.id }, data: { order: b.order } }),
    prisma.rookieLessonAssignment.update({ where: { id: b.id }, data: { order: a.order } }),
  ]);
  revalidatePath("/admin/rookie-journey");
}

export async function setRookieDayFieldSkillsAction(dayNumber: number, fieldSkillIds: string[]) {
  await requireAdmin();
  const day = await prisma.rookieDay.findUnique({ where: { dayNumber }, select: { id: true } });
  if (!day) return;

  await prisma.$transaction([
    prisma.rookieDayFieldSkill.deleteMany({ where: { rookieDayId: day.id } }),
    prisma.rookieDayFieldSkill.createMany({
      data: fieldSkillIds.map((fieldSkillId, i) => ({ rookieDayId: day.id, fieldSkillId, order: i })),
    }),
  ]);
  revalidatePath("/admin/rookie-journey");
  revalidatePath("/");
}

export async function addFieldSkillAction(formData: FormData) {
  await requireAdmin();
  const labelEn = String(formData.get("labelEn") ?? "").trim();
  const labelEs = String(formData.get("labelEs") ?? "").trim();
  if (!labelEn || !labelEs) return;
  const key = labelEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const count = await prisma.fieldSkill.count();
  await prisma.fieldSkill.create({ data: { key: `${key}_${count}`, labelEn, labelEs, order: count } });
  revalidatePath("/admin/rookie-journey");
}

// ── Trainer: daily field checkoff ──

export interface CheckoffFormRating {
  fieldSkillId: string;
  rating: FieldSkillRating;
  note?: string;
}

export async function recordFieldCheckoffAction(
  traineeId: string,
  rookieDayNumber: number,
  ratings: CheckoffFormRating[],
  notes: { wentWell?: string; needsCoaching?: string; tomorrowFocus?: string }
) {
  const session = await requireTrainerOrAdmin();
  await recordFieldCheckoff({
    traineeId,
    trainerId: session.sub,
    rookieDayNumber,
    ratings,
    wentWellNotes: notes.wentWell,
    needsCoachingNotes: notes.needsCoaching,
    tomorrowFocusNotes: notes.tomorrowFocus,
  });
  revalidateEmployeeViews(traineeId);
}

// ── Day-3 readiness / Day-10 review / Day-30 Seal ──
// Deliberately NOT certification — see the schema comments on
// RookieDay3Readiness/RookieDay10Review. A Trainer can record either alone,
// same authority level as logging a Field Evaluation.

export async function setDay3ReadinessAction(traineeId: string, decision: RookieDay3Decision, notes: string) {
  const session = await requireTrainerOrAdmin();
  await prisma.rookieDay3Readiness.upsert({
    where: { traineeId },
    create: { traineeId, decision, notes: notes || null, decidedById: session.sub },
    update: { decision, notes: notes || null, decidedById: session.sub, decidedAt: new Date() },
  });
  revalidateEmployeeViews(traineeId);
}

export async function setDay10ReviewAction(
  traineeId: string,
  decision: RookieDay10Decision,
  extra: { extensionReason?: string; skillsNeedingDevelopment?: string; newReviewDate?: string }
) {
  const session = await requireTrainerOrAdmin();
  const newReviewDate = extra.newReviewDate ? new Date(extra.newReviewDate) : null;
  await prisma.rookieDay10Review.upsert({
    where: { traineeId },
    create: {
      traineeId,
      decision,
      extensionReason: extra.extensionReason || null,
      skillsNeedingDevelopment: extra.skillsNeedingDevelopment || null,
      newReviewDate,
      decidedById: session.sub,
    },
    update: {
      decision,
      extensionReason: extra.extensionReason || null,
      skillsNeedingDevelopment: extra.skillsNeedingDevelopment || null,
      newReviewDate,
      decidedById: session.sub,
      decidedAt: new Date(),
    },
  });
  revalidateEmployeeViews(traineeId);
}

// Records a Day-30 Seal evaluation. This does NOT itself flip
// CertificationStatus — an Admin/Service Manager still makes that call
// through the existing certification actions, now informed by this
// evaluation, exactly as the spec asks ("integrate with, don't replace").
export async function recordSealEvaluationAction(
  traineeId: string,
  categoryScores: { key: string; score: number; note?: string }[],
  decision: SealDecision,
  notes: string
) {
  const session = await requireTrainerOrAdmin();
  await prisma.sealOfApprovalEvaluation.create({
    data: {
      traineeId,
      categoryScores: categoryScores as unknown as object,
      decision,
      notes: notes || null,
      evaluatedById: session.sub,
    },
  });
  revalidateEmployeeViews(traineeId);
}
