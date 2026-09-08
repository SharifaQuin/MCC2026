"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
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

export async function saveApplicantNotesAction(applicantId: string, formData: FormData) {
  await requireRecruitingAccess();
  const notes = String(formData.get("notes") ?? "");
  await prisma.applicant.update({ where: { id: applicantId }, data: { notes } });
  revalidatePath(`/recruiting/applicants/${applicantId}`);
}
