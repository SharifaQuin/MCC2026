"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateInviteToken } from "@/lib/tokens";
import { isAdminOrServiceManager } from "@/lib/session";
import { assignDefaultOnboardingDocuments } from "@/lib/onboarding";
import { generateNextEmployeeId } from "@/lib/employeeId";

export interface BulkInviteResult {
  name: string;
  email: string;
  inviteUrl?: string;
  addedWithoutInvite?: boolean;
  error?: string;
}

export interface BulkInviteState {
  error?: string;
  results?: BulkInviteResult[];
}

const VALID_ROLES = new Set(["TRAINEE", "TRAINER"]);
const MAX_ROWS = 500;

function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM — Excel commonly adds one when "saving as CSV", which
  // would otherwise make the header-row check below silently fail to match.
  const cleaned = text.replace(/^﻿/, "");
  return cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

export async function bulkInviteAction(
  _prevState: BulkInviteState,
  formData: FormData
): Promise<BulkInviteState> {
  const session = await getSession();
  if (!session || !isAdminOrServiceManager(session.role)) {
    return { error: "Not authorized." };
  }

  const file = formData.get("csvFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file to upload." };
  }

  const text = await file.text();
  let rows = parseCsv(text);
  if (rows.length === 0) {
    return { error: "The CSV file is empty." };
  }

  // Allow an optional header row (e.g. "name,email,role,hireDate").
  if (rows[0][0]?.toLowerCase() === "name" && rows[0][1]?.toLowerCase() === "email") {
    rows = rows.slice(1);
  }

  if (rows.length === 0) {
    return { error: "No employee rows found in the CSV." };
  }
  if (rows.length > MAX_ROWS) {
    return {
      error: `This file has ${rows.length} rows — please split it into batches of ${MAX_ROWS} or fewer. (If you didn't expect that many rows, the file may not be a plain CSV — re-save it as "CSV (Comma delimited)" rather than an Excel workbook.)`,
    };
  }

  // Unchecked = add everyone to the roster now, invite each of them later —
  // the same choice the single Invite form offers, just applied to the
  // whole batch (e.g. importing an already-hired roster).
  const sendInviteNow = formData.get("sendInviteNow") !== null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const results: BulkInviteResult[] = [];

  for (const row of rows) {
    const name = row[0] ?? "";
    const email = (row[1] ?? "").toLowerCase();
    const roleRaw = (row[2] ?? "TRAINEE").toUpperCase();
    const role = VALID_ROLES.has(roleRaw) ? (roleRaw as "TRAINEE" | "TRAINER") : "TRAINEE";
    const hireDateRaw = (row[3] ?? "").trim();
    const hireDate = hireDateRaw ? new Date(hireDateRaw) : null;

    if (!name || !email) {
      results.push({ name, email, error: "Missing name or email." });
      continue;
    }
    if (!email.includes("@")) {
      results.push({ name, email, error: `"${email}" doesn't look like a valid email address.` });
      continue;
    }
    if (hireDateRaw && Number.isNaN(hireDate?.getTime())) {
      results.push({ name, email, error: `Invalid hire date "${hireDateRaw}" (use YYYY-MM-DD).` });
      continue;
    }

    // A single malformed or unexpected row (bad encoding, a stray control
    // character from a re-saved spreadsheet, a DB hiccup) shouldn't crash
    // the whole batch — report it and keep going.
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        results.push({ name, email, error: "An account with this email already exists." });
        continue;
      }

      const inviteToken = sendInviteNow ? generateInviteToken() : null;
      const employeeId = await generateNextEmployeeId();
      const newUser = await prisma.user.create({
        data: {
          employeeId,
          email,
          name,
          role,
          hireDate,
          inviteToken,
          inviteExpiresAt: sendInviteNow ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) : null,
          invitedBy: session.sub,
        },
      });
      if (role === "TRAINEE") await assignDefaultOnboardingDocuments(newUser.id);

      results.push(
        sendInviteNow
          ? { name, email, inviteUrl: `${appUrl}/invite/${inviteToken}` }
          : { name, email, addedWithoutInvite: true }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const friendly = message.includes("invalid byte sequence")
        ? "This row has a character that can't be saved (often from pasting out of Word or a reformatted spreadsheet) — try retyping the name and re-uploading just this row."
        : "Something went wrong saving this row — try retyping it and re-uploading just this row.";
      results.push({ name, email, error: friendly });
    }
  }

  revalidatePath("/admin/employees");

  return { results };
}
