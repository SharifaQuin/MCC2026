import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "mcc_session";

export type Role = "TRAINEE" | "ADMIN" | "TRAINER" | "SERVICE_MANAGER";
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
  return verifySessionToken(token);
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
