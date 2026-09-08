"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { scorePrescreenAnswers } from "@/lib/recruiting";

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

  redirect(`/apply/${slug}/thank-you?applied=${applicant.id}`);
}
