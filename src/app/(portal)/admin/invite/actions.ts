"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateInviteToken } from "@/lib/password";
import { isAdminOrServiceManager } from "@/lib/session";

export interface InviteState {
  error?: string;
  inviteUrl?: string;
}

export async function inviteAction(
  _prevState: InviteState,
  formData: FormData
): Promise<InviteState> {
  const session = await getSession();
  if (!session || !isAdminOrServiceManager(session.role)) {
    return { error: "Not authorized." };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "TRAINEE") as "TRAINEE" | "TRAINER";

  if (!email || !name) {
    return { error: "Name and email are required." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists." };
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

  revalidatePath("/admin/employees");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return { inviteUrl: `${appUrl}/invite/${inviteToken}` };
}
