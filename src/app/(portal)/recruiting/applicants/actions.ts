"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import type { ApplicantStage } from "@prisma/client";

const STAGE_TIMESTAMP_FIELD: Partial<Record<ApplicantStage, "rejectedAt" | "benchedAt" | "hiredAt">> = {
  REJECTED: "rejectedAt",
  BENCH: "benchedAt",
  HIRED: "hiredAt",
};

// Phase 1 keeps stage changes manual — a manager reviews and moves the
// applicant forward themselves. Later phases will auto-advance most of
// this and only ask for a confirm click on reject/bench.
export async function setApplicantStageAction(applicantId: string, stage: ApplicantStage) {
  await requireRecruitingAccess();
  const timestampField = STAGE_TIMESTAMP_FIELD[stage];

  await prisma.applicant.update({
    where: { id: applicantId },
    data: {
      stage,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
  revalidatePath("/recruiting/applicants");
}

// For walk-ins, referrals, or anyone recruited outside the public
// application form (a call, an in-person conversation) — added directly
// by a manager, skipping the prescreen questions since none were asked.
export async function createManualApplicantAction(formData: FormData) {
  await requireRecruitingAccess();

  const jobPostingId = String(formData.get("jobPostingId") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const resumeDataUrl = String(formData.get("resumeDataUrl") ?? "") || null;
  const resumeFileName = String(formData.get("resumeFileName") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!jobPostingId || !firstName || !lastName || !email || !phone) return;

  const applicant = await prisma.applicant.create({
    data: {
      jobPostingId,
      firstName,
      lastName,
      email,
      phone,
      resumeDataUrl,
      resumeFileName,
      notes,
      stage: "NEW",
    },
  });

  revalidatePath("/recruiting");
  revalidatePath("/recruiting/applicants");
  redirect(`/recruiting/applicants/${applicant.id}`);
}

export async function saveApplicantNotesAction(applicantId: string, formData: FormData) {
  await requireRecruitingAccess();
  const notes = String(formData.get("notes") ?? "");
  await prisma.applicant.update({ where: { id: applicantId }, data: { notes } });
  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function sendApplicantEmailAction(applicantId: string, formData: FormData) {
  const { session } = await requireRecruitingAccess();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) return;

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
  const result = await sendEmail({ to: applicant.email, subject, body });

  await prisma.communicationLog.create({
    data: {
      applicantId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      subject,
      body,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error,
      sentById: session.sub,
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function sendApplicantTextAction(applicantId: string, formData: FormData) {
  const { session } = await requireRecruitingAccess();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
  const result = await sendSms({ to: applicant.phone, text: body });

  await prisma.communicationLog.create({
    data: {
      applicantId,
      channel: "SMS",
      direction: "OUTBOUND",
      body,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error,
      sentById: session.sub,
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}
