// ONE-TIME DATA FIX — review this script and get the owner's approval
// before running it against production. It has been verified against a
// local/dev database via e2e/part-time-cleaner-posting-fix.spec.ts, which
// calls the exact same applyPartTimeHouseCleanerPrescreenFix() helper this
// script calls, against dev-only fixtures shaped like the real postings.
//
// Fixes posting cmwpehomm00n8exng5u8qed5e ("Part-Time House Cleaner (No
// Experience Needed)"): its 19 prescreen questions were all added through
// the admin editor before it could set stepLabel, so every one of them has
// stepLabel=null — /apply/part-time-house-cleaner-no-experience-needed
// builds zero wizard steps ("Step 1 of 0") and can never be completed.
//
// This replaces ALL of that posting's prescreen questions with a copy of
// the Cleaning Technician posting's (cmuflxjv20002108dp6bw74ar — read-only,
// never modified), then applies the specific changes described in the
// task this shipped with: removes the "Cleaning Experience" step, adds a
// new "Do you have any house cleaning experience?" question to "About
// You", replaces the Monday–Friday availability question with a part-time
// schedule question, and renames the transportation question. Pass
// threshold stays 100 and the posting stays inactive.
//
// Run with: npx tsx scripts/fix-part-time-cleaner-prescreen.ts
import { PrismaClient } from "@prisma/client";
import { applyPartTimeHouseCleanerPrescreenFix } from "../src/lib/recruiting";

const SOURCE_POSTING_ID = "cmuflxjv20002108dp6bw74ar"; // Cleaning Technician
const TARGET_POSTING_ID = "cmwpehomm00n8exng5u8qed5e"; // Part-Time House Cleaner (No Experience Needed)

const prisma = new PrismaClient();

async function main() {
  const target = await prisma.jobPosting.findUniqueOrThrow({
    where: { id: TARGET_POSTING_ID },
    include: { prescreenQuestions: true },
  });

  // Guard against running this against the wrong posting, or re-running it
  // after it's already been fixed: the broken state this script expects is
  // "every question's stepLabel is null."
  if (target.prescreenQuestions.length === 0 || target.prescreenQuestions.some((q) => q.stepLabel !== null)) {
    throw new Error(
      `Aborting: posting ${TARGET_POSTING_ID} doesn't look like the broken state this script expects ` +
        `(every question's stepLabel should currently be null). Has it already been fixed?`
    );
  }

  // Never touch applicant data — replacing the target's prescreen
  // questions cascades to delete any PrescreenAnswer rows tied to them.
  // Given the broken "Step 1 of 0" state, nobody should have been able to
  // complete an application yet, but this is checked rather than assumed.
  const applicantCount = await prisma.applicant.count({ where: { jobPostingId: TARGET_POSTING_ID } });
  if (applicantCount > 0) {
    throw new Error(
      `Aborting: posting ${TARGET_POSTING_ID} already has ${applicantCount} applicant(s) on file. ` +
        `Replacing its prescreen questions would cascade-delete their saved answers. Resolve manually first.`
    );
  }

  await prisma.$transaction((tx) =>
    applyPartTimeHouseCleanerPrescreenFix(tx, SOURCE_POSTING_ID, TARGET_POSTING_ID)
  );

  const final = await prisma.jobPosting.findUniqueOrThrow({
    where: { id: TARGET_POSTING_ID },
    include: { prescreenQuestions: { orderBy: { order: "asc" } } },
  });
  console.log(`Done. ${final.prescreenQuestions.length} prescreen questions on "${final.titleEn}":`);
  for (const q of final.prescreenQuestions) {
    console.log(`  [${q.stepLabel ?? "(no step)"}] ${q.order}. ${q.textEn}`);
  }
  console.log(`passThresholdPct=${final.passThresholdPct} active=${final.active}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
