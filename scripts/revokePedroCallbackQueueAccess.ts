// Operational tool — never imported or run by the app itself. Run by hand
// with `npx tsx scripts/revokePedroCallbackQueueAccess.ts <command> ...`.
//
// One-time cleanup for the brief's item 4: the owner explicitly said Pedro
// Paez should not have the sales Leads & Callbacks page. His SALES_LEADS
// AreaAccess is already None; his access comes entirely from a
// CALLBACK_QUEUE grant, which this removes — and only that grant. His
// Recruiting/Applicants, Onboarding, Training, HR Summary, and Assigned
// Tasks access (and anything else) is never touched.
//
//   find
//     Read-only. Lists every active, non-test OFFICE_ASSISTANT user whose
//     name matches "Pedro Paez" (case-insensitive; matched by name, never
//     by email — a personal email can go stale). Exits non-zero and
//     changes nothing unless exactly one match is found.
//
//   revoke <userId> --confirm
//     Re-verifies, at delete time, that <userId> is still an active
//     OFFICE_ASSISTANT user named "Pedro Paez" with exactly one
//     CALLBACK_QUEUE AreaAccess row (regardless of what `find` reported
//     earlier) — refuses otherwise. Writes a restore snapshot of the
//     exact row before deleting it. Refuses to run without --confirm.
//
//   restore --snapshot <path>
//     Re-creates the exact deleted row (same id, same canEdit). Safe to
//     run more than once — a no-op if the row already exists.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { findPedroPaezCandidates, revokeCallbackQueueGrant } from "./lib/pedroCallbackQueueAccess";

const prisma = new PrismaClient();

interface Snapshot {
  userId: string;
  userName: string;
  userEmail: string;
  areaAccess: { id: string; area: "CALLBACK_QUEUE"; canEdit: boolean; createdAt: string };
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

async function findCandidates() {
  return findPedroPaezCandidates(prisma);
}

async function runFind() {
  const candidates = await findCandidates();
  if (candidates.length === 0) {
    console.error("No active OFFICE_ASSISTANT user named \"Pedro Paez\" was found. Nothing changed.");
    process.exitCode = 1;
    return;
  }
  if (candidates.length > 1) {
    console.error(`Found ${candidates.length} ambiguous matches — refusing to guess. Nothing changed.`);
    for (const c of candidates) console.error(`  - ${c.id}  ${c.name}  <${c.email}>`);
    process.exitCode = 1;
    return;
  }
  const [user] = candidates;
  const grant = await prisma.areaAccess.findUnique({
    where: { userId_area: { userId: user.id, area: "CALLBACK_QUEUE" } },
  });
  console.log(`Exactly one match: ${user.id}  ${user.name}  <${user.email}>`);
  console.log(
    grant
      ? `CALLBACK_QUEUE grant: canEdit=${grant.canEdit} (created ${grant.createdAt.toISOString()})`
      : "No CALLBACK_QUEUE grant exists for this user — nothing to revoke."
  );
  console.log(`\nNext: npx tsx scripts/revokePedroCallbackQueueAccess.ts revoke ${user.id} --confirm`);
}

async function runRevoke(userId: string, args: string[]) {
  if (!args.includes("--confirm")) throw new Error("revoke requires --confirm");

  // Re-verifies at delete time (never trusts an id from an earlier `find`
  // run or from memory) and performs the actual deletion — the exact same
  // function e2e/pedro-callback-queue-revocation.spec.ts exercises.
  const result = await revokeCallbackQueueGrant(prisma, userId);
  if (!result.revoked || !result.snapshot) {
    if (result.reason?.startsWith("No CALLBACK_QUEUE")) {
      console.log(result.reason);
      return;
    }
    throw new Error(`Refusing: ${result.reason} Re-run "find" and verify before retrying.`);
  }

  const snapshot: Snapshot = {
    userId,
    userName: result.snapshot.userName,
    userEmail: result.snapshot.userEmail,
    areaAccess: {
      id: result.snapshot.areaAccessId,
      area: "CALLBACK_QUEUE",
      canEdit: result.snapshot.canEdit,
      createdAt: new Date().toISOString(),
    },
  };
  const outPath =
    flagValue(args, "--out") ?? path.join(__dirname, "snapshots", `${userId}-callback-queue-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot written to ${outPath}`);
  console.log(`Revoked CALLBACK_QUEUE for ${result.snapshot.userName} <${result.snapshot.userEmail}> (${userId}).`);
  console.log("Every other area grant (Recruiting/Applicants, Onboarding, Training, HR Summary, Assigned Tasks, etc.) is untouched.");
}

async function runRestore(args: string[]) {
  const snapshotPath = flagValue(args, "--snapshot");
  if (!snapshotPath) throw new Error("restore requires --snapshot <path>");
  const snapshot: Snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

  const existing = await prisma.areaAccess.findUnique({
    where: { userId_area: { userId: snapshot.userId, area: "CALLBACK_QUEUE" } },
  });
  if (existing) {
    console.log("CALLBACK_QUEUE grant already exists for this user — nothing to restore.");
    return;
  }
  await prisma.areaAccess.create({
    data: {
      id: snapshot.areaAccess.id,
      userId: snapshot.userId,
      area: "CALLBACK_QUEUE",
      canEdit: snapshot.areaAccess.canEdit,
    },
  });
  console.log(`Restored CALLBACK_QUEUE for ${snapshot.userName} <${snapshot.userEmail}>.`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "find") {
    await runFind();
  } else if (command === "revoke") {
    const [userId, ...flags] = rest;
    if (!userId) throw new Error("revoke requires <userId>");
    await runRevoke(userId, flags);
  } else if (command === "restore") {
    await runRestore(rest);
  } else {
    console.error("Usage: revokePedroCallbackQueueAccess.ts <find|revoke <userId> --confirm|restore --snapshot <path>>");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
