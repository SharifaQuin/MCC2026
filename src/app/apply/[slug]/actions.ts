"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { scorePrescreenAnswers, notifyNewApplicant } from "@/lib/recruiting";

export async function submitApplicationAction(slug: string, formData: FormData) {
  const posting = await prisma.jobPosting.findUnique({
    where: { slug },
    include: { prescreenQuestions: true },
  });
  if (!posting || !posting.active) redirect(`/apply/${slug}?error=closed`);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const resumeDataUrl = String(formData.get("resumeDataUrl") ?? "");
  const resumeFileName = String(formData.get("resumeFileName") ?? "");

  if (!firstName || !lastName || !email || !phone || !resumeDataUrl) {
    redirect(`/apply/${slug}?error=incomplete`);
  }

  const answers = posting!.prescreenQuestions.map((q) => ({
    questionId: q.id,
    optionId: String(formData.get(`question_${q.id}`) ?? ""),
  }));
  if (answers.some((a) => !a.optionId)) {
    redirect(`/apply/${slug}?error=incomplete`);
  }

  const existing = await prisma.applicant.findFirst({
    where: { jobPostingId: posting.id, email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    redirect(`/apply/${slug}?error=duplicate`);
  }

  const { score, maxScore, passed } = await scorePrescreenAnswers(posting.id, answers);

  const applicant = await prisma.applicant.create({
    data: {
      jobPostingId: posting.id,
      firstName,
      lastName,
      email,
      phone,
      resumeDataUrl,
      resumeFileName,
      prescreenScore: score,
      prescreenMaxScore: maxScore,
      prescreenPassed: passed,
      stage: passed ? "PRESCREEN_PASSED" : "PRESCREEN_FAILED",
      answers: { create: answers },
    },
  });

  await notifyNewApplicant(applicant, posting.titleEn);

  redirect(`/apply/${slug}/thank-you?applied=${applicant.id}`);
}
