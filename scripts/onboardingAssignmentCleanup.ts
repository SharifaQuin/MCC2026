// Operational tool — never imported or run by the app itself. Run by hand
// with `npx tsx scripts/onboardingAssignmentCleanup.ts <command> ...`.
//
//   audit <userId> [--out <path>]
//     Read-only. Lists this user's unsigned default-document assignments
//     and writes a restore snapshot (default: scripts/snapshots/<userId>-
//     <timestamp>.json). Always run this first. Refuses (clear error,
//     non-zero exit, nothing written) if the user's LIVE role is TRAINEE —
//     their unsigned default documents are the legitimate onboarding
//     packet, never erroneous.
//
//   cleanup <userId> --snapshot <path> --confirm
//     Deletes exactly the rows in the given snapshot, after re-verifying
//     each one against the live database (see deleteAssignmentsFromSnapshot
//     in scripts/lib/onboardingAssignmentAudit.ts for exactly what that
//     re-check covers). Refuses to run without --confirm, refuses a
//     snapshot whose userId doesn't match the one given here, and refuses
//     outright (nothing deleted) if the user's LIVE role is TRAINEE —
//     re-checked at delete time regardless of what role the snapshot
//     itself recorded, so a stale or edited snapshot can't bypass this.
//
//   restore --snapshot <path>
//     Re-creates the exact rows from a snapshot (same ids). Safe to run
//     more than once.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  findErroneousDefaultAssignments,
  buildSnapshot,
  deleteAssignmentsFromSnapshot,
  restoreAssignmentsFromSnapshot,
  type OnboardingAssignmentSnapshot,
} from "./lib/onboardingAssignmentAudit";

const prisma = new PrismaClient();

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function loadSnapshot(filePath: string): OnboardingAssignmentSnapshot {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

async function runAudit(userId: string, args: string[]) {
  const rows = await findErroneousDefaultAssignments(prisma, userId);
  const snapshot = await buildSnapshot(prisma, userId, rows);

  console.log(`User: ${snapshot.user?.email ?? "(not found)"} — role ${snapshot.user?.role ?? "?"}, account created ${snapshot.user?.createdAt ?? "?"}`);
  console.log(`Criteria: ${snapshot.criteria}`);
  console.log(`Found ${rows.length} erroneous assignment(s):`);
  for (const r of rows) {
    console.log(
      `  - ${r.id}  "${r.documentTitle}"  assigned ${r.createdAt}  (unsigned)`
    );
  }

  const outPath =
    flagValue(args, "--out") ??
    path.join(__dirname, "snapshots", `${userId}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot written to ${outPath}`);
}

async function runCleanup(userId: string, args: string[]) {
  const snapshotPath = flagValue(args, "--snapshot");
  if (!snapshotPath) throw new Error("cleanup requires --snapshot <path>");
  const confirm = args.includes("--confirm");

  const snapshot = loadSnapshot(snapshotPath);
  if (snapshot.userId !== userId) {
    throw new Error(
      `Snapshot is for userId ${snapshot.userId}, not ${userId} — refusing to run a mismatched snapshot.`
    );
  }

  const result = await deleteAssignmentsFromSnapshot(prisma, snapshot, { confirm });
  console.log(`Deleted ${result.deleted.length}: ${result.deleted.join(", ") || "(none)"}`);
  if (result.skipped.length) {
    console.log("Skipped:");
    for (const s of result.skipped) console.log(`  - ${s.id}: ${s.reason}`);
  }
}

async function runRestore(args: string[]) {
  const snapshotPath = flagValue(args, "--snapshot");
  if (!snapshotPath) throw new Error("restore requires --snapshot <path>");
  const snapshot = loadSnapshot(snapshotPath);

  const result = await restoreAssignmentsFromSnapshot(prisma, snapshot);
  console.log(`Restored ${result.restored.length}: ${result.restored.join(", ") || "(none)"}`);
  if (result.skipped.length) console.log(`Already present, skipped: ${result.skipped.join(", ")}`);
}

async function main() {
  const [command, userIdArg, ...rest] = process.argv.slice(2);

  if (command === "audit") {
    if (!userIdArg) throw new Error("Usage: audit <userId> [--out <path>]");
    await runAudit(userIdArg, rest);
  } else if (command === "cleanup") {
    if (!userIdArg) throw new Error("Usage: cleanup <userId> --snapshot <path> --confirm");
    await runCleanup(userIdArg, rest);
  } else if (command === "restore") {
    await runRestore([userIdArg, ...rest].filter((a): a is string => a !== undefined));
  } else {
    console.error("Usage: onboardingAssignmentCleanup.ts <audit|cleanup|restore> ...");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
