"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateInviteToken } from "@/lib/password";

export interface BulkInviteResult {
  name: string;
  email: string;
  inviteUrl?: string;
  error?: string;
}

export interface BulkInviteState {
  error?: string;
  results?: BulkInviteResult[];
}

const VALID_ROLES = new Set(["TRAINEE", "TRAINER"]);

function parseCsv(text: string): string[][] {
  return text
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
  if (!session || session.role !== "ADMIN") {
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

  // Allow an optional header row (e.g. "name,email,role").
  if (rows[0][0]?.toLowerCase() === "name" && rows[0][1]?.toLowerCase() === "email") {
    rows = rows.slice(1);
  }

  if (rows.length === 0) {
    return { error: "No employee rows found in the CSV." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const results: BulkInviteResult[] = [];

  for (const row of rows) {
    const name = row[0] ?? "";
    const email = (row[1] ?? "").toLowerCase();
    const roleRaw = (row[2] ?? "TRAINEE").toUpperCase();
    const role = VALID_ROLES.has(roleRaw) ? (roleRaw as "TRAINEE" | "TRAINER") : "TRAINEE";

    if (!name || !email) {
      results.push({ name, email, error: "Missing name or email." });
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      results.push({ name, email, error: "An account with this email already exists." });
      continue;
    }

    const inviteToken = generateInviteToken();
    await prisma.user.create({
      data: {
        email,
        name,
        role,
        inviteToken,
        inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        invitedBy: session.sub,
      },
    });

    results.push({ name, email, inviteUrl: `${appUrl}/invite/${inviteToken}` });
  }

  revalidatePath("/admin/employees");

  return { results };
}
