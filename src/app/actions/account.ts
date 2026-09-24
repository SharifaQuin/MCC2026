"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminOrServiceManager } from "@/lib/session";
import { generateInviteToken } from "@/lib/tokens";

async function requireAdminOrServiceManager() {
  const session = await getSession();
  if (!session || !isAdminOrServiceManager(session.role)) throw new Error("Not authorized");
  return session;
}

// A SERVICE_MANAGER can manage any non-Admin account, but never an Admin's
// — otherwise they could force a password reset (and log in as that Admin)
// or lock an Admin out entirely. Only another Admin can manage an Admin
// account. Checked against the target's *current* role on every call,
// not cached, since roles can change between requests.
async function assertCanManageTarget(callerRole: string, targetUserId: string) {
  if (callerRole === "ADMIN") return;
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
  if (target?.role === "ADMIN") throw new Error("Not authorized to manage an Admin account.");
}

export interface ResetPasswordState {
  error?: string;
  inviteUrl?: string;
}

export async function resetPasswordAction(
  userId: string,
  _prevState: ResetPasswordState,
  _formData: FormData
): Promise<ResetPasswordState> {
  const session = await requireAdminOrServiceManager();
  await assertCanManageTarget(session.role, userId);

  const inviteToken = generateInviteToken();
  await prisma.user.update({
    where: { id: userId },
    data: {
      inviteToken,
      inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      mustSetPassword: true,
    },
  });

  revalidatePath(`/admin/employees/${userId}`);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return { inviteUrl: `${appUrl}/invite/${inviteToken}` };
}

export async function setAccountActiveAction(userId: string, active: boolean) {
  const session = await requireAdminOrServiceManager();
  await assertCanManageTarget(session.role, userId);
  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath(`/admin/employees/${userId}`);
  revalidatePath("/admin/employees");
}
