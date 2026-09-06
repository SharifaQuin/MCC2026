"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";

export interface ChangePasswordState {
  error?: string;
  success?: boolean;
}

export async function changeOwnPasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.passwordHash) {
    return { error: "Account not found." };
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return { error: "Current password is incorrect." };
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { success: true };
}
