"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";

export interface SetPasswordState {
  error?: string;
}

export async function setPasswordAction(
  token: string,
  _prevState: SetPasswordState,
  formData: FormData
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user || (user.inviteExpiresAt && user.inviteExpiresAt < new Date())) {
    return { error: "This invite link is invalid or has expired. Ask your admin to resend it." };
  }
  if (!user.active) {
    return { error: "This account has been deactivated. Contact your administrator." };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustSetPassword: false,
      inviteToken: null,
      inviteExpiresAt: null,
    },
  });

  await setSessionCookie({
    sub: user.id,
    role: user.role,
    language: user.language,
    name: user.name,
  });

  redirect("/");
}
