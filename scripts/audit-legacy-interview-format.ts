// Read-only audit for the legacy-record limitation documented on
// resolveInterviewFormat in src/lib/recruiting.ts: a scheduled interview
// booked before the explicit InterviewFormat field existed (interviewFormat
// still null) has its format guessed from the applicant's current stage —
// PHONE_INTERVIEW_SCHEDULED -> ZOOM, anything else -> IN_PERSON. That guess
// can be wrong for a record whose stage was later hand-corrected, or whose
// original booking predates today's stage conventions.
//
// This script finds every such record and cross-checks the guess against
// what was *actually sent* at the time (the most recent EMAIL
// CommunicationLog body for that applicant around their scheduling) — real,
// historical, immutable evidence of which format the interview really was,
// independent of the applicant's current stage. A mismatch means the
// fallback would compute the wrong format *today* (e.g. a reminder or a
// self-service reschedule would send Zoom content for what was actually an
// in-person interview, or vice versa).
//
// Never writes anything. Run this against production before relying on
// self-service reschedule/reminders for any applicant it flags; remediating
// a flagged record is a separate, manual, reviewed step — never an
// automatic correction, and never a corrective message to the candidate
// without explicit approval.
//
//   DATABASE_URL="postgresql://...production..." npx tsx scripts/audit-legacy-interview-format.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ZOOM_EVIDENCE = /zoom link:/i;
const IN_PERSON_EVIDENCE = /📍 Location:|📍 Ubicación:/;

async function main() {
  const candidates = await prisma.applicant.findMany({
    where: { interviewFormat: null, scheduledAt: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      stage: true,
      scheduledAt: true,
      interviewerId: true,
    },
    orderBy: { scheduledAt: "asc" },
  });

  console.log(`Found ${candidates.length} legacy record(s) relying on the stage-based format fallback.\n`);

  let flagged = 0;
  for (const applicant of candidates) {
    const guessedFormat = applicant.stage === "PHONE_INTERVIEW_SCHEDULED" ? "ZOOM" : "IN_PERSON";

    const lastEmail = await prisma.communicationLog.findFirst({
      where: { applicantId: applicant.id, channel: "EMAIL", direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
      select: { body: true, createdAt: true },
    });

    let evidenceFormat: "ZOOM" | "IN_PERSON" | null = null;
    if (lastEmail?.body) {
      const hasZoom = ZOOM_EVIDENCE.test(lastEmail.body);
      const hasInPerson = IN_PERSON_EVIDENCE.test(lastEmail.body);
      if (hasZoom && !hasInPerson) evidenceFormat = "ZOOM";
      else if (hasInPerson && !hasZoom) evidenceFormat = "IN_PERSON";
      // Both or neither present: inconclusive from this one email, left
      // unflagged by evidence (but still listed below as relying on the
      // fallback, for manual review) rather than guessed at.
    }

    const mismatch = evidenceFormat !== null && evidenceFormat !== guessedFormat;
    if (mismatch) flagged++;

    console.log(
      `${mismatch ? "⚠️  MISMATCH" : "  ok       "} ${applicant.firstName} ${applicant.lastName} <${applicant.email}>` +
        ` — stage=${applicant.stage} scheduledAt=${applicant.scheduledAt?.toISOString()}` +
        ` guessed=${guessedFormat} evidence=${evidenceFormat ?? "none/inconclusive"}` +
        (mismatch
          ? ` — resolveInterviewFormat would compute ${guessedFormat} today, but the last email actually sent looks like ${evidenceFormat}`
          : "")
    );
  }

  console.log(
    `\n${flagged} of ${candidates.length} legacy record(s) show a real mismatch between the computed fallback and what was historically sent.`
  );
  console.log(
    "No data was changed. A flagged record needs manual review before relying on self-service reschedule/reminders for it."
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
