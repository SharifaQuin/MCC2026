"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return { error: "Invalid email or password." };
  }

  if (!user.active) {
    return { error: "This account has been deactivated. Contact your administrator." };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return {
      error: `Too many failed attempts. Try again in ${minutesLeft} minute${
        minutesLeft === 1 ? "" : "s"
      }.`,
    };
  }

  if (user.mustSetPassword) {
    return {
      error:
        "Your account hasn't been activated yet. Use the invite link sent to your email to set your password.",
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    const lockOut = failedLoginAttempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockOut ? 0 : failedLoginAttempts,
        lockedUntil: lockOut
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : user.lockedUntil,
      },
    });
    if (lockOut) {
      return {
        error: `Too many failed attempts. Your account is locked for ${LOCKOUT_MINUTES} minutes.`,
      };
    }
    return { error: "Invalid email or password." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
  });

  await setSessionCookie({
    sub: user.id,
    role: user.role,
    language: user.language,
    name: user.name,
  });

  redirect(next && next.startsWith("/") ? next : "/");
}
