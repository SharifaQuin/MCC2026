"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  scorePrescreenAnswers,
  notifyNewApplicant,
  parseApplicantSource,
  sendApplicantAcknowledgmentEmail,
} from "@/lib/recruiting";

export async function submitApplicationAction(slug: string, formData: FormData) {
  const posting = await prisma.jobPosting.findUnique({
    where: { slug },
    include: { prescreenQuestions: true },
  });
  if (!posting || !posting.active) redirect(`/apply/${slug}?error=closed`);

  // The original V1 form still posts separate firstName/lastName fields;
  // the richer V2 wizard asks for one "Full Name" field instead (per the
  // Cleaning Technician application spec) and is split here rather than
  // adding a new Applicant column — first word is firstName, the rest is
  // lastName, same as most single-field name inputs handle it.
  const fullName = String(formData.get("fullName") ?? "").trim();
  let firstName = String(formData.get("firstName") ?? "").trim();
  let lastName = String(formData.get("lastName") ?? "").trim();
  if (fullName && !firstName && !lastName) {
    const [first, ...rest] = fullName.split(/\s+/);
    firstName = first ?? "";
    lastName = rest.join(" ");
  }

  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;
  const resumeDataUrl = String(formData.get("resumeDataUrl") ?? "");
  const resumeFileName = String(formData.get("resumeFileName") ?? "");
  const source = parseApplicantSource(String(formData.get("src") ?? ""));
  const utmSource = String(formData.get("utmSource") ?? "").trim() || null;
  const utmMedium = String(formData.get("utmMedium") ?? "").trim() || null;
  const utmCampaign = String(formData.get("utmCampaign") ?? "").trim() || null;
  const utmContent = String(formData.get("utmContent") ?? "").trim() || null;
  const utmTerm = String(formData.get("utmTerm") ?? "").trim() || null;

  if (!firstName || !lastName || !email || !phone) {
    redirect(`/apply/${slug}?error=incomplete`);
  }
  // Resume is required unless this posting explicitly opts out of that
  // requirement (Recruiting 2.0 — see JobPosting.resumeRequired).
  if (posting!.resumeRequired && !resumeDataUrl) {
    redirect(`/apply/${slug}?error=incomplete`);
  }

  // Build one PrescreenAnswer per question: SINGLE_SELECT reads a single
  // value, MULTI_SELECT reads every checked value (getAll), TEXT/DATE read
  // the free-text/date string into answerText instead of an optionId.
  // A question conditional on another option (an "Other, please explain"
  // follow-up, or a compound-requirement branch) is only required — and
  // only saved at all — if its trigger option was actually selected;
  // otherwise it's simply skipped, exactly as the applicant never saw it.
  const selectedOptionIds = new Set(
    posting!.prescreenQuestions.flatMap((q) =>
      q.type === "SINGLE_SELECT" || q.type === "MULTI_SELECT"
        ? formData.getAll(`question_${q.id}`).map(String)
        : []
    )
  );

  type AnswerInput = { questionId: string; optionId?: string | null; answerText?: string | null };
  const answers: AnswerInput[] = [];
  for (const q of posting!.prescreenQuestions) {
    const isTriggered = !q.conditionalOnOptionId || selectedOptionIds.has(q.conditionalOnOptionId);
    if (!isTriggered) continue;

    if (q.type === "SINGLE_SELECT") {
      const optionId = String(formData.get(`question_${q.id}`) ?? "");
      if (!optionId) {
        if (q.required) redirect(`/apply/${slug}?error=incomplete`);
        continue;
      }
      answers.push({ questionId: q.id, optionId });
    } else if (q.type === "MULTI_SELECT") {
      const optionIds = formData.getAll(`question_${q.id}`).map(String).filter(Boolean);
      if (optionIds.length === 0) {
        if (q.required) redirect(`/apply/${slug}?error=incomplete`);
        continue;
      }
      for (const optionId of optionIds) answers.push({ questionId: q.id, optionId });
    } else {
      const text = String(formData.get(`question_${q.id}`) ?? "").trim();
      if (!text) {
        if (q.required) redirect(`/apply/${slug}?error=incomplete`);
        continue;
      }
      answers.push({ questionId: q.id, answerText: text });
    }
  }

  const existing = await prisma.applicant.findFirst({
    where: { jobPostingId: posting.id, email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    redirect(`/apply/${slug}?error=duplicate`);
  }

  const { score, maxScore, passed } = await scorePrescreenAnswers(
    posting.id,
    answers.filter((a) => a.optionId).map((a) => ({ questionId: a.questionId, optionId: a.optionId! }))
  );

  const applicant = await prisma.applicant.create({
    data: {
      jobPostingId: posting.id,
      firstName,
      lastName,
      email,
      phone,
      city,
      resumeDataUrl: resumeDataUrl || null,
      resumeFileName: resumeFileName || null,
      source,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      prescreenScore: score,
      prescreenMaxScore: maxScore,
      prescreenPassed: passed,
      stage: passed ? "PRESCREEN_PASSED" : "PRESCREEN_FAILED",
      answers: { create: answers },
    },
  });

  await notifyNewApplicant(applicant, posting.titleEn);
  // Every applicant gets the same neutral "we received it" acknowledgment
  // regardless of prescreen result — it never promises advancement, so
  // there's no reason to withhold it from anyone who submitted.
  await sendApplicantAcknowledgmentEmail(applicant, posting.titleEn);

  redirect(`/apply/${slug}/thank-you?applied=${applicant.id}`);
}
