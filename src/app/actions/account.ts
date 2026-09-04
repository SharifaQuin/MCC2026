"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateInviteToken } from "@/lib/password";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
  return session;
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
  await requireAdmin();

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
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath(`/admin/employees/${userId}`);
  revalidatePath("/admin/employees");
}
