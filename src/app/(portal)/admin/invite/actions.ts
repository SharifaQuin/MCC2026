"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateInviteToken } from "@/lib/tokens";
import { isAdminOrServiceManager } from "@/lib/session";
import { assignDefaultOnboardingDocuments } from "@/lib/onboarding";

export interface InviteState {
  error?: string;
  inviteUrl?: string;
  addedWithoutInvite?: boolean;
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
  // Unchecked checkboxes submit nothing at all (not "off"), so presence is
  // the signal. Unchecked = add them to the roster now, send the actual
  // invite link later (e.g. once they've completed paperwork) via "Send
  // Invite" on their profile.
  const sendInviteNow = formData.get("sendInviteNow") !== null;

  if (!email || !name) {
    return { error: "Name and email are required." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists." };
  }

  const inviteToken = sendInviteNow ? generateInviteToken() : null;
  const newUser = await prisma.user.create({
    data: {
      email,
      name,
      role,
      inviteToken,
      inviteExpiresAt: sendInviteNow ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) : null,
      invitedBy: session.sub,
    },
  });
  if (role === "TRAINEE") await assignDefaultOnboardingDocuments(newUser.id);

  revalidatePath("/admin/employees");

  if (!sendInviteNow) {
    return { addedWithoutInvite: true };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return { inviteUrl: `${appUrl}/invite/${inviteToken}` };
}
