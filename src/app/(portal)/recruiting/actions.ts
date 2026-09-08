"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `posting-${Date.now()}`
  );
}

export async function createJobPostingAction(formData: FormData) {
  await requireRecruitingAccess();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  if (!titleEn) return;

  const positionType = String(formData.get("positionType") ?? "").trim() || null;
  const descriptionEn = String(formData.get("descriptionEn") ?? "").trim();
  const passThresholdPct = Number(formData.get("passThresholdPct") ?? 70) || 70;

  let slug = slugify(titleEn);
  const existing = await prisma.jobPosting.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString().slice(-5)}`;

  const posting = await prisma.jobPosting.create({
    data: { titleEn, positionType, descriptionEn, passThresholdPct, slug },
  });

  revalidatePath("/recruiting");
  redirect(`/recruiting/postings/${posting.id}`);
}

export async function updateJobPostingAction(id: string, formData: FormData) {
  await requireRecruitingAccess();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  if (!titleEn) return;

  await prisma.jobPosting.update({
    where: { id },
    data: {
      titleEn,
      positionType: String(formData.get("positionType") ?? "").trim() || null,
      descriptionEn: String(formData.get("descriptionEn") ?? "").trim(),
      passThresholdPct: Number(formData.get("passThresholdPct") ?? 70) || 70,
      active: formData.get("active") === "on",
    },
  });

  revalidatePath(`/recruiting/postings/${id}`);
  revalidatePath("/recruiting");
}

export async function addPrescreenQuestionAction(jobPostingId: string) {
  await requireRecruitingAccess();

  const count = await prisma.prescreenQuestion.count({ where: { jobPostingId } });
  const question = await prisma.prescreenQuestion.create({
    data: { jobPostingId, textEn: "New question", order: count + 1 },
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
  await prisma.prescreenQuestion.update({ where: { id: questionId }, data: { textEn } });

  await Promise.all(
    optionIds.map((optionId) =>
      prisma.prescreenOption.update({
        where: { id: optionId },
        data: {
          textEn: String(formData.get(`option_${optionId}_text`) ?? "").trim(),
          points: Number(formData.get(`option_${optionId}_points`) ?? 0) || 0,
        },
      })
    )
  );

  revalidatePath(`/recruiting/postings/${jobPostingId}`);
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
