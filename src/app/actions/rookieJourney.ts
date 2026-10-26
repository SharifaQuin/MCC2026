"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, type SessionPayload } from "@/lib/session";
import { getTrueActorId } from "@/lib/impersonation";
import { logAudit } from "@/lib/auditLog";
import { assertTrainingContentEditAccess } from "@/lib/trainingContentAccess";
import {
  recordFieldCheckoff,
  markRookieContentComplete,
  setTrainingExperienceVersion,
  getTrainingExperienceVersion,
  ROOKIE_DAY_COUNT,
  type TrainingExperienceVersion,
} from "@/lib/rookieJourney";
import type {
  FieldSkillRating,
  RookieDay3Decision,
  RookieDay10Decision,
  SealDecision,
  RookieContentKind,
} from "@prisma/client";

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

export interface SaveResult {
  ok: boolean;
  error?: string;
}

const STALE_SAVE_ERROR =
  "This content was changed by someone else since you opened it — reload the page to see the latest version before saving again.";
const NOT_LIVE_CURRICULUM_ERROR =
  "This isn't part of the live curriculum right now — the active training mode changed, or this content isn't assigned to it. Reload to see what's current.";

// Shared by the granted-editor's narrowly-scoped Rookie Day view
// (/training/content-editor/day/[n]) and the ADMIN-only
// /admin/rookie-journey editor — same pattern as
// admin/content/actions.ts's tryContentEditAccess: never throws, so a
// revoked grant surfaces as a clean save-rejection message rather than an
// uncaught error.
async function tryContentEditAccess(): Promise<
  { ok: true; session: SessionPayload; isAdmin: boolean } | { ok: false; error: string }
> {
  try {
    const { session, isAdmin } = await assertTrainingContentEditAccess();
    return { ok: true, session, isAdmin };
  } catch {
    return {
      ok: false,
      error: "You no longer have permission to edit this content — reload the page to continue.",
    };
  }
}

function revalidateEmployeeViews(traineeId: string) {
  revalidatePath(`/admin/employees/${traineeId}`);
  revalidatePath(`/trainer/employees/${traineeId}`);
  revalidatePath(`/trainer/employees/${traineeId}/checkoff`);
  revalidatePath("/");
}

// ── Admin: which training experience Trainees see ──
// A global, instantly-reversible switch — same OwnerSetting pattern as the
// Recruiting Draft 1/Draft 2 toggle. Deliberately ADMIN-only.
export async function setTrainingExperienceVersionAction(formData: FormData) {
  await requireAdmin();
  const version = String(formData.get("version") ?? "rookie") as TrainingExperienceVersion;
  await setTrainingExperienceVersion(version === "classic" ? "classic" : "rookie");
  revalidatePath("/admin/rookie-journey");
  revalidatePath("/");
}

// ── Admin: Rookie Day content ──

// Shared by the ADMIN-only /admin/rookie-journey editor and the narrowly-
// scoped /training/content-editor/day/[n] route a granted non-admin editor
// reaches — re-checked on every save, never cached, so a mid-session
// revocation blocks the very next save. estimatedAcademyMinutes and
// fieldGoalEn/Es are field-skill/schedule administration, not content — a
// non-admin caller's values for those are force-ignored in favor of the
// row's current ones, even if a forged request included them.
export async function updateRookieDayContentAction(
  dayNumber: number,
  expectedUpdatedAt: string,
  formData: FormData
): Promise<SaveResult> {
  const access = await tryContentEditAccess();
  if (!access.ok) return access;
  const { session, isAdmin } = access;

  // Rookie Day content has no classic equivalent — while Classic is the
  // active training mode, it isn't the live curriculum, so a non-admin
  // editor may not touch it. Computed fresh, never trusted from the client.
  // The route itself bounds dayNumber to 1..ROOKIE_DAY_COUNT before this
  // action is ever reachable through the UI, but a non-admin could still
  // call the action directly with a forged out-of-range dayNumber — that
  // boundary belongs here too, not just at the page.
  if (!isAdmin && ((await getTrainingExperienceVersion()) !== "rookie" || dayNumber < 1 || dayNumber > ROOKIE_DAY_COUNT)) {
    return { ok: false, error: NOT_LIVE_CURRICULUM_ERROR };
  }

  const current = await prisma.rookieDay.findUnique({ where: { dayNumber } });
  if (!current) return { ok: false, error: "Rookie Day not found." };
  if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
    return { ok: false, error: STALE_SAVE_ERROR };
  }

  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const next = {
    titleEn: field("titleEn"),
    titleEs: field("titleEs"),
    descriptionEn: field("descriptionEn"),
    descriptionEs: field("descriptionEs"),
    // Schedule/field-skill administration — ADMIN-only even for a permitted
    // editor, enforced here rather than just hiding the inputs.
    estimatedAcademyMinutes: isAdmin
      ? Number(field("estimatedAcademyMinutes")) || 0
      : current.estimatedAcademyMinutes,
    fieldGoalEn: isAdmin ? field("fieldGoalEn") || null : current.fieldGoalEn,
    fieldGoalEs: isAdmin ? field("fieldGoalEs") || null : current.fieldGoalEs,
  };

  await prisma.rookieDay.update({ where: { dayNumber }, data: next });

  await logAudit({
    actorId: getTrueActorId(session),
    action: "TRAINING_CONTENT_EDITED",
    recordType: "RookieDay",
    recordId: current.id,
    changedFields: {
      titleEn: { from: current.titleEn, to: next.titleEn },
      titleEs: { from: current.titleEs, to: next.titleEs },
      descriptionEn: { from: current.descriptionEn, to: next.descriptionEn },
      descriptionEs: { from: current.descriptionEs, to: next.descriptionEs },
    },
  });

  revalidatePath("/admin/rookie-journey");
  revalidatePath(`/training/content-editor/day/${dayNumber}`);
  revalidatePath("/");
  return { ok: true };
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

// ── Rookie Curriculum V2 (Phase 2): condensed content items ──

export async function markRookieContentCompleteAction(contentItemId: string) {
  const session = await getSession();
  if (!session) throw new Error("Not authorized");
  await markRookieContentComplete(session.sub, contentItemId);
  revalidatePath("/");
}

// The standalone-page equivalent of completeLessonAction (modules/[slug]/lesson/[order]/actions.ts)
// — marks the card reviewed, then sends the trainee straight to the next
// item in their Rookie Day sequence.
export async function completeRookieContentAndContinueAction(contentItemId: string, nextHref: string) {
  const session = await getSession();
  if (!session) redirect("/login");
  await markRookieContentComplete(session.sub, contentItemId);
  revalidatePath("/");
  redirect(nextHref);
}

export interface RookieContentItemFormInput {
  kind: RookieContentKind;
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  promptEn?: string;
  promptEs?: string;
  revealEn?: string;
  revealEs?: string;
  hasFutureVideoSlot: boolean;
  videoUrl?: string;
  videoUrlEs?: string;
  estimatedMinutes?: number;
  sourceLessonIds: string[];
}

export async function createRookieContentItemAction(dayNumber: number, input: RookieContentItemFormInput) {
  await requireAdmin();
  const day = await prisma.rookieDay.findUnique({ where: { dayNumber }, select: { id: true } });
  if (!day) return;

  const [maxLesson, maxContent] = await Promise.all([
    prisma.rookieLessonAssignment.aggregate({ where: { rookieDayId: day.id }, _max: { order: true } }),
    prisma.rookieContentItem.aggregate({ where: { rookieDayId: day.id }, _max: { order: true } }),
  ]);
  const nextOrder = Math.max(maxLesson._max.order ?? -1, maxContent._max.order ?? -1) + 1;

  const created = await prisma.rookieContentItem.create({
    data: {
      rookieDayId: day.id,
      kind: input.kind,
      order: nextOrder,
      titleEn: input.titleEn,
      titleEs: input.titleEs,
      bodyEn: input.bodyEn,
      bodyEs: input.bodyEs,
      promptEn: input.promptEn || null,
      promptEs: input.promptEs || null,
      revealEn: input.revealEn || null,
      revealEs: input.revealEs || null,
      hasFutureVideoSlot: input.hasFutureVideoSlot,
      videoUrl: input.videoUrl || null,
      videoUrlEs: input.videoUrlEs || null,
      estimatedMinutes: input.estimatedMinutes ?? null,
    },
  });
  if (input.sourceLessonIds.length) {
    await prisma.rookieContentSourceLesson.createMany({
      data: input.sourceLessonIds.map((lessonId) => ({ contentItemId: created.id, lessonId })),
    });
  }
  revalidatePath("/admin/rookie-journey");
  revalidatePath("/");
}

// Shared the same way as updateRookieDayContentAction above. `kind` and
// `sourceLessonIds` are curatorial/structural, not content — force-ignored
// for a non-admin caller in favor of the row's current values, even if a
// forged request tried to change them. hasFutureVideoSlot/estimatedMinutes
// are likewise left ADMIN-only (not among the fields the owner named as
// editor-touchable).
export async function updateRookieContentItemAction(
  contentItemId: string,
  expectedUpdatedAt: string,
  input: RookieContentItemFormInput
): Promise<SaveResult> {
  const access = await tryContentEditAccess();
  if (!access.ok) return access;
  const { session, isAdmin } = access;

  if (!isAdmin && (await getTrainingExperienceVersion()) !== "rookie") {
    return { ok: false, error: NOT_LIVE_CURRICULUM_ERROR };
  }

  const current = await prisma.rookieContentItem.findUnique({
    where: { id: contentItemId },
    include: { rookieDay: { select: { dayNumber: true } } },
  });
  if (!current) return { ok: false, error: "Content card not found." };

  // A card on an out-of-range/orphaned Day is never live curriculum for a
  // non-admin — closes a forged-contentItemId path the page's own
  // dayNumber bound can't catch (the page checks the ROUTE's dayNumber,
  // not the day this specific card actually belongs to).
  if (!isAdmin && (current.rookieDay.dayNumber < 1 || current.rookieDay.dayNumber > ROOKIE_DAY_COUNT)) {
    return { ok: false, error: NOT_LIVE_CURRICULUM_ERROR };
  }

  if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
    return { ok: false, error: STALE_SAVE_ERROR };
  }

  const next = {
    kind: isAdmin ? input.kind : current.kind,
    titleEn: input.titleEn,
    titleEs: input.titleEs,
    bodyEn: input.bodyEn,
    bodyEs: input.bodyEs,
    promptEn: input.promptEn || null,
    promptEs: input.promptEs || null,
    revealEn: input.revealEn || null,
    revealEs: input.revealEs || null,
    hasFutureVideoSlot: isAdmin ? input.hasFutureVideoSlot : current.hasFutureVideoSlot,
    videoUrl: input.videoUrl || null,
    videoUrlEs: input.videoUrlEs || null,
    estimatedMinutes: isAdmin ? (input.estimatedMinutes ?? null) : current.estimatedMinutes,
  };

  await prisma.$transaction([
    prisma.rookieContentItem.update({ where: { id: contentItemId }, data: next }),
    ...(isAdmin
      ? [
          prisma.rookieContentSourceLesson.deleteMany({ where: { contentItemId } }),
          ...(input.sourceLessonIds.length
            ? [
                prisma.rookieContentSourceLesson.createMany({
                  data: input.sourceLessonIds.map((lessonId) => ({ contentItemId, lessonId })),
                }),
              ]
            : []),
        ]
      : []),
  ]);

  await logAudit({
    actorId: getTrueActorId(session),
    action: "TRAINING_CONTENT_EDITED",
    recordType: "RookieContentItem",
    recordId: contentItemId,
    changedFields: {
      titleEn: { from: current.titleEn, to: next.titleEn },
      titleEs: { from: current.titleEs, to: next.titleEs },
      bodyEn: { from: current.bodyEn, to: next.bodyEn },
      bodyEs: { from: current.bodyEs, to: next.bodyEs },
      promptEn: { from: current.promptEn, to: next.promptEn },
      promptEs: { from: current.promptEs, to: next.promptEs },
      revealEn: { from: current.revealEn, to: next.revealEn },
      revealEs: { from: current.revealEs, to: next.revealEs },
      videoUrl: { from: current.videoUrl, to: next.videoUrl },
      videoUrlEs: { from: current.videoUrlEs, to: next.videoUrlEs },
    },
  });

  revalidatePath("/admin/rookie-journey");
  revalidatePath(`/training/content-editor/day/${current.rookieDay.dayNumber}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deleteRookieContentItemAction(contentItemId: string) {
  await requireAdmin();
  await prisma.rookieContentItem.delete({ where: { id: contentItemId } });
  revalidatePath("/admin/rookie-journey");
  revalidatePath("/");
}

// Moves an item up/down within a Rookie Day's merged sequence — the item
// may be a RookieLessonAssignment or a RookieContentItem; both share the
// same per-day `order` namespace, so this reorders across both types.
export async function moveDaySequenceItemAction(
  dayNumber: number,
  item: { type: "LESSON" | "CONTENT"; id: string },
  direction: "up" | "down"
) {
  await requireAdmin();
  const day = await prisma.rookieDay.findUnique({ where: { dayNumber }, select: { id: true } });
  if (!day) return;

  const [lessons, contentItems] = await Promise.all([
    prisma.rookieLessonAssignment.findMany({ where: { rookieDayId: day.id, slot: "ROOKIE_DAY" } }),
    prisma.rookieContentItem.findMany({ where: { rookieDayId: day.id } }),
  ]);
  const merged = [
    ...lessons.map((l) => ({ type: "LESSON" as const, id: l.id, order: l.order })),
    ...contentItems.map((c) => ({ type: "CONTENT" as const, id: c.id, order: c.order })),
  ].sort((a, b) => a.order - b.order);

  const idx = merged.findIndex((m) => m.type === item.type && m.id === item.id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= merged.length) return;

  const a = merged[idx];
  const b = merged[swapIdx];
  const updateOne = (m: (typeof merged)[number], order: number) =>
    m.type === "LESSON"
      ? prisma.rookieLessonAssignment.update({ where: { id: m.id }, data: { order } })
      : prisma.rookieContentItem.update({ where: { id: m.id }, data: { order } });

  await prisma.$transaction([updateOne(a, b.order), updateOne(b, a.order)]);
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
    trainerId: getTrueActorId(session),
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
    create: { traineeId, decision, notes: notes || null, decidedById: getTrueActorId(session) },
    update: { decision, notes: notes || null, decidedById: getTrueActorId(session), decidedAt: new Date() },
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
      decidedById: getTrueActorId(session),
    },
    update: {
      decision,
      extensionReason: extra.extensionReason || null,
      skillsNeedingDevelopment: extra.skillsNeedingDevelopment || null,
      newReviewDate,
      decidedById: getTrueActorId(session),
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
      evaluatedById: getTrueActorId(session),
    },
  });
  revalidateEmployeeViews(traineeId);
}
