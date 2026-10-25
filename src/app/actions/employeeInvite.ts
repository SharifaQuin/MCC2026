"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateInviteToken } from "@/lib/tokens";
import { isAdminOrServiceManager } from "@/lib/session";
import { assignDefaultOnboardingDocuments } from "@/lib/onboarding";
import { generateNextEmployeeId } from "@/lib/employeeId";
import { getTrueActorId } from "@/lib/impersonation";
import { getAssignableRolesForInviter, type AssignableRole } from "@/lib/roleAssignment";

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

  // The raw form value must never be trusted with a bare type cast — that's
  // compile-time-only and lets a caller submit any string (e.g. "ADMIN")
  // that Prisma would happily accept as a valid Role. Beyond that, the set
  // of roles even considered valid here is scoped to what *this* inviter is
  // authorized to grant.
  const assignableRoles = getAssignableRolesForInviter(session.role);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  // The role field being genuinely absent (no "role" key at all — e.g. a
  // caller that never sends one) keeps its long-standing Trainee default.
  // But once a value IS present, whether from the real <select>, a tampered
  // one, or a forged direct call, it must be one this inviter is actually
  // authorized to grant — an unrecognized string or a role outside their
  // allowed set is refused outright, with nothing created, rather than
  // silently downgraded to Trainee (which would create an account under a
  // role nobody chose and no error anyone would see).
  const roleField = formData.get("role");
  let role: AssignableRole;
  if (roleField === null) {
    role = "TRAINEE";
  } else {
    const roleRaw = String(roleField).trim().toUpperCase();
    if (!assignableRoles.includes(roleRaw as AssignableRole)) {
      return { error: "You aren't authorized to assign that role." };
    }
    role = roleRaw as AssignableRole;
  }
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
  const employeeId = await generateNextEmployeeId();
  const newUser = await prisma.user.create({
    data: {
      employeeId,
      email,
      name,
      role,
      inviteToken,
      inviteExpiresAt: sendInviteNow ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) : null,
      invitedBy: getTrueActorId(session),
    },
  });
  if (role === "TRAINEE") await assignDefaultOnboardingDocuments(newUser.id);

  revalidatePath("/staff");

  if (!sendInviteNow) {
    return { addedWithoutInvite: true };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return { inviteUrl: `${appUrl}/invite/${inviteToken}` };
}
