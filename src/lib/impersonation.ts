import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  setSessionCookie,
  verifySessionToken,
  type Role,
} from "@/lib/session";
import type { SessionPayload } from "@/lib/session";

// Second cookie holding the owner's own signed session token, verbatim,
// while they're viewing the app as a test account. Restoring impersonation
// is just putting this back as the main session cookie — no re-login.
const IMPERSONATION_STASH_COOKIE = "mcc_impersonation_stash";

export const ROLE_LABELS: Record<Role, string> = {
  TRAINEE: "Trainee / New Hire",
  TRAINER: "Trainer",
  SERVICE_MANAGER: "Service Manager",
  ADMIN: "Admin / Owner",
};

const STASH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

// Only ADMIN can start impersonation, and only onto seeded test accounts —
// never a real employee's account, even by an owner who could otherwise
// reset anyone's password. This keeps "View As" from doubling as a way to
// silently see a real employee's session.
export async function startImpersonation(targetUserId: string): Promise<void> {
  const currentToken = cookies().get(SESSION_COOKIE)?.value;
  if (!currentToken) throw new Error("Not authorized");
  const currentSession = await verifySessionToken(currentToken);
  if (!currentSession || currentSession.role !== "ADMIN") throw new Error("Not authorized");
  if (cookies().get(IMPERSONATION_STASH_COOKIE)?.value) {
    throw new Error("Already viewing as a test account — return to owner view first");
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || !target.isTestAccount) throw new Error("Not a valid test account");
  if (!target.active) throw new Error("This test account is deactivated");

  cookies().set(IMPERSONATION_STASH_COOKIE, currentToken, STASH_COOKIE_OPTS);

  const targetPayload: SessionPayload = {
    sub: target.id,
    role: target.role,
    language: target.language,
    name: target.name,
  };
  await setSessionCookie(targetPayload);
}

export async function stopImpersonation(): Promise<void> {
  const stashToken = cookies().get(IMPERSONATION_STASH_COOKIE)?.value;
  if (!stashToken) return;
  cookies().set(SESSION_COOKIE, stashToken, STASH_COOKIE_OPTS);
  cookies().delete(IMPERSONATION_STASH_COOKIE);
}

export interface ImpersonationState {
  isImpersonating: boolean;
  ownerName: string | null;
}

export async function getImpersonationState(): Promise<ImpersonationState> {
  const stashToken = cookies().get(IMPERSONATION_STASH_COOKIE)?.value;
  if (!stashToken) return { isImpersonating: false, ownerName: null };
  const ownerSession = await verifySessionToken(stashToken);
  return { isImpersonating: true, ownerName: ownerSession?.name ?? "Owner" };
}
