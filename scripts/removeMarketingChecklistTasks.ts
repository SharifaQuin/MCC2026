// Operational tool — never imported or run by the app itself. Run by hand
// with `npx tsx scripts/removeMarketingChecklistTasks.ts --confirm`.
//
// One-time cleanup for the brief's item 7: these two recurring tasks were
// already removed from prisma/seed.ts's CHECKLIST_TASKS array (so a fresh
// seed run no longer creates them), but any copy already in the database
// from an earlier seed run survives that change on its own and needs
// deleting directly. ChecklistTask has no other model's foreign key
// pointing at it (only its own assigneeId -> User, unaffected by deleting
// the task) — confirmed against prisma/schema.prisma — so this delete is
// leaf-safe with nothing else to clean up alongside it.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TASKS_TO_REMOVE = [
  "Log any new lead/client in the Marketing & Leads Tracker (source, type, value)",
  "Check in on Marketing spend vs. leads generated so far",
];

async function main() {
  const confirm = process.argv.includes("--confirm");

  const existing = await prisma.checklistTask.findMany({
    where: { task: { in: TASKS_TO_REMOVE } },
    select: { id: true, task: true, frequency: true, assigneeId: true },
  });

  if (existing.length === 0) {
    console.log("Neither task exists in the database — nothing to do.");
    return;
  }

  console.log(`Found ${existing.length} matching row(s):`);
  for (const t of existing) {
    console.log(`  - ${t.id}  [${t.frequency}]  "${t.task}"${t.assigneeId ? `  (assigned to ${t.assigneeId})` : ""}`);
  }

  if (!confirm) {
    console.log("\nDry run only — re-run with --confirm to delete these rows.");
    return;
  }

  const result = await prisma.checklistTask.deleteMany({ where: { task: { in: TASKS_TO_REMOVE } } });
  console.log(`\nDeleted ${result.count} row(s).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
