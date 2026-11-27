import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

import { SESSION_COOKIE } from "@/lib/sessionCookie";
export { SESSION_COOKIE };

export type Role = "TRAINEE" | "ADMIN" | "TRAINER" | "SERVICE_MANAGER" | "OFFICE_ASSISTANT" | "SALES_REP";
export type Language = "EN" | "ES";

// Service Manager has Trainer abilities plus certify/decline and
// invite/account management, but never content editing (Admin/Owner-only).
export function isAdminOrServiceManager(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "SERVICE_MANAGER";
}

export interface SessionPayload {
  sub: string;
  role: Role;
  language: Language;
  name: string;
  // Present only while an Owner is viewing/acting as this user (see
  // src/lib/impersonation.ts). sub/role/language/name above are always the
  // user being acted as — that's what makes every existing permission check
  // and data-scoping query in the app correctly apply the target's own
  // access with no changes needed elsewhere. This field is the one place
  // the real actor survives alongside that, so a mutation can still
  // attribute itself to the Owner rather than the employee.
  actingAs?: { ownerId: string; ownerName: string } | undefined;
  [key: string]: unknown;
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  // A valid, unexpired token isn't enough on its own — the account itself
  // may have been deactivated since this cookie was issued (sessions last
  // 30 days). Re-check against the database on every call so deactivation
  // takes effect immediately, with no 30-day window where a revoked
  // account's existing cookie still works.
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { active: true } });
  if (!user || !user.active) return null;

  return payload;
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}
