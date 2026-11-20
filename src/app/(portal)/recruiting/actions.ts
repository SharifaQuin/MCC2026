"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import {
  seedDefaultHiringQuestions,
  saveInterviewLogistics,
  slugifyPostingTitle,
  duplicateJobPosting,
} from "@/lib/recruiting";
import type { JobPostingRoleTrack, PrescreenQuestionCategory, PrescreenQuestionType } from "@prisma/client";

const VALID_ROLE_TRACKS = new Set(["LEAD_TECHNICIAN", "ASSISTANT_TECHNICIAN", "OTHER"]);
const VALID_QUESTION_TYPES = new Set(["SINGLE_SELECT", "MULTI_SELECT", "TEXT", "DATE"]);
const VALID_QUESTION_CATEGORIES = new Set([
  "REQUIRED",
  "PREFERRED",
  "QUALIFICATION",
  "APPLICATION",
  "CULTURE_BEHAVIORAL",
  "OPTIONAL",
]);

export async function createJobPostingAction(formData: FormData) {
  await requireRecruitingAccess();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  if (!titleEn) return;

  const titleEs = String(formData.get("titleEs") ?? "").trim() || null;
  const positionType = String(formData.get("positionType") ?? "").trim() || null;
  const descriptionEn = String(formData.get("descriptionEn") ?? "").trim();
  const passThresholdPct = Number(formData.get("passThresholdPct") ?? 70) || 70;
  const roleTrackRaw = String(formData.get("roleTrack") ?? "OTHER");
  const roleTrack = (VALID_ROLE_TRACKS.has(roleTrackRaw) ? roleTrackRaw : "OTHER") as JobPostingRoleTrack;

  let slug = slugifyPostingTitle(titleEn);
  const existing = await prisma.jobPosting.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString().slice(-5)}`;

  const posting = await prisma.jobPosting.create({
    data: { titleEn, titleEs, positionType, descriptionEn, passThresholdPct, roleTrack, slug },
  });

  // Seed the standard bilingual phone-screen + structured-interview
  // question banks so every candidate for this posting gets the same
  // questions in the same order — editable per posting afterward.
  await seedDefaultHiringQuestions(posting.id);

  revalidatePath("/recruiting");
  redirect(`/recruiting/postings/${posting.id}`);
}

export async function updateJobPostingAction(id: string, formData: FormData) {
  await requireRecruitingAccess();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  if (!titleEn) return;

  const roleTrackRaw = String(formData.get("roleTrack") ?? "OTHER");
  const roleTrack = (VALID_ROLE_TRACKS.has(roleTrackRaw) ? roleTrackRaw : "OTHER") as JobPostingRoleTrack;

  await prisma.jobPosting.update({
    where: { id },
    data: {
      titleEn,
      titleEs: String(formData.get("titleEs") ?? "").trim() || null,
      positionType: String(formData.get("positionType") ?? "").trim() || null,
      descriptionEn: String(formData.get("descriptionEn") ?? "").trim(),
      passThresholdPct: Number(formData.get("passThresholdPct") ?? 70) || 70,
      roleTrack,
      active: formData.get("active") === "on",
    },
  });

  revalidatePath(`/recruiting/postings/${id}`);
  revalidatePath("/recruiting");
}

export async function saveInterviewLogisticsAction(formData: FormData) {
  await requireRecruitingAccess();

  await saveInterviewLogistics({
    address: String(formData.get("address") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    arrivalInstructionsEn: String(formData.get("arrivalInstructionsEn") ?? "").trim(),
    arrivalInstructionsEs: String(formData.get("arrivalInstructionsEs") ?? "").trim(),
  });

  revalidatePath("/recruiting/settings");
}

export async function addPrescreenQuestionAction(jobPostingId: string) {
  await requireRecruitingAccess();

  const count = await prisma.prescreenQuestion.count({ where: { jobPostingId } });
  // New questions default to the posting's last step (so a question added
  // to flesh out a step the owner is already building stays on it, rather
  // than silently vanishing into a null stepLabel the apply wizard can't
  // show at all — see applyPartTimeHouseCleanerPrescreenFix's own comment
  // for exactly that failure mode) and to SINGLE_SELECT.
  const lastQuestion = await prisma.prescreenQuestion.findFirst({
    where: { jobPostingId },
    orderBy: { order: "desc" },
    select: { stepLabel: true },
  });

  const question = await prisma.prescreenQuestion.create({
    data: {
      jobPostingId,
      textEn: "New question",
      order: count + 1,
      stepLabel: lastQuestion?.stepLabel ?? null,
      type: "SINGLE_SELECT",
    },
  });
  // Start every question with two blank answer options so there's
  // somewhere to immediately fill in point values.
  await prisma.prescreenOption.createMany({
    data: [
      { questionId: question.id, order: 1, textEn: "", points: 0 },
      { questionId: question.id, order: 2, textEn: "", points: 0 },
    ],
  });

  revalidatePath(`/recruiting/postings/${jobPostingId}`);
}

export async function deletePrescreenQuestionAction(jobPostingId: string, questionId: string) {
  await requireRecruitingAccess();
  await prisma.prescreenQuestion.delete({ where: { id: questionId } });
  revalidatePath(`/recruiting/postings/${jobPostingId}`);
}

// Saves a question's text plus every one of its options (text + point
// value) in one submit, mirroring the quiz QuestionEditor pattern.
export async function saveQuestionWithOptionsAction(
  jobPostingId: string,
  questionId: string,
  optionIds: string[],
  formData: FormData
) {
  await requireRecruitingAccess();
  const textEn = String(formData.get("textEn") ?? "").trim();
  const shortLabel = String(formData.get("shortLabel") ?? "").trim() || null;
  const stepLabel = String(formData.get("stepLabel") ?? "").trim() || null;
  const typeRaw = String(formData.get("type") ?? "SINGLE_SELECT");
  const type = (VALID_QUESTION_TYPES.has(typeRaw) ? typeRaw : "SINGLE_SELECT") as PrescreenQuestionType;
  const categoryRaw = String(formData.get("category") ?? "REQUIRED");
  const category = (
    VALID_QUESTION_CATEGORIES.has(categoryRaw) ? categoryRaw : "REQUIRED"
  ) as PrescreenQuestionCategory;
  const required = formData.get("required") === "on";
  const maxLengthRaw = String(formData.get("maxLength") ?? "").trim();
  const maxLength = maxLengthRaw ? Number(maxLengthRaw) || null : null;

  await prisma.prescreenQuestion.update({
    where: { id: questionId },
    data: { textEn, shortLabel, stepLabel, type, category, required, maxLength },
  });

  // Only touch an option whose fields were actually submitted — the editor
  // hides the answer-choice inputs entirely for TEXT/DATE questions, and a
  // field that was never rendered shouldn't silently blank out an existing
  // option (e.g. a brief switch to TEXT and back to SINGLE_SELECT must not
  // lose the answer choices that were there before).
  await Promise.all(
    optionIds.map((optionId) => {
      if (!formData.has(`option_${optionId}_text`)) return null;
      return prisma.prescreenOption.update({
        where: { id: optionId },
        data: {
          textEn: String(formData.get(`option_${optionId}_text`) ?? "").trim(),
          points: Number(formData.get(`option_${optionId}_points`) ?? 0) || 0,
        },
      });
    })
  );

  revalidatePath(`/recruiting/postings/${jobPostingId}`);
}

export async function duplicateJobPostingAction(jobPostingId: string) {
  await requireRecruitingAccess();
  const copy = await duplicateJobPosting(jobPostingId);
  revalidatePath("/recruiting/postings");
  redirect(`/recruiting/postings/${copy.id}`);
}

export async function addPrescreenOptionAction(jobPostingId: string, questionId: string) {
  await requireRecruitingAccess();
  const count = await prisma.prescreenOption.count({ where: { questionId } });
  await prisma.prescreenOption.create({
    data: { questionId, order: count + 1, textEn: "", points: 0 },
  });
  revalidatePath(`/recruiting/postings/${jobPostingId}`);
}

export async function deletePrescreenOptionAction(jobPostingId: string, optionId: string) {
  await requireRecruitingAccess();
  await prisma.prescreenOption.delete({ where: { id: optionId } });
  revalidatePath(`/recruiting/postings/${jobPostingId}`);
}
