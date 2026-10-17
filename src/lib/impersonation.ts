import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import {
  SESSION_COOKIE,
  setSessionCookie,
  verifySessionToken,
  type Role,
} from "@/lib/session";
import type { SessionPayload } from "@/lib/session";

// Second cookie holding the owner's own signed session token, verbatim,
// while they're viewing/acting as another user. Restoring is just putting
// this back as the main session cookie — no re-login — but only after
// re-verifying it (see stopActingAs): a tampered, expired, or forged stash
// must never be trusted to hand back a session.
const ACTING_AS_STASH_COOKIE = "mcc_impersonation_stash";

export const ROLE_LABELS: Record<Role, string> = {
  TRAINEE: "Trainee / New Hire",
  TRAINER: "Trainer",
  SERVICE_MANAGER: "Service Manager",
  ADMIN: "Admin / Owner",
  OFFICE_ASSISTANT: "Office Assistant",
};

const STASH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

function clearActingAsCookies() {
  cookies().delete(SESSION_COOKIE);
  cookies().delete(ACTING_AS_STASH_COOKIE);
}

// Only a currently-authorized ADMIN can start this, and never onto another
// Admin or onto themselves. Authorization is re-checked two ways, not just
// trusted from a cookie: the current session token's own signature/expiry
// (verifySessionToken rejects anything forged or expired), and a fresh DB
// read of that same user's role/active flag — so an Owner whose access was
// revoked moments ago can't start a new "act as" session on a still-valid
// but now-stale token.
export async function startActingAs(targetUserId: string): Promise<void> {
  const currentToken = cookies().get(SESSION_COOKIE)?.value;
  if (!currentToken) throw new Error("Not authorized");
  const currentSession = await verifySessionToken(currentToken);
  if (!currentSession || currentSession.role !== "ADMIN") throw new Error("Not authorized");
  if (currentSession.actingAs) throw new Error("Not authorized");
  if (cookies().get(ACTING_AS_STASH_COOKIE)?.value) {
    throw new Error("Already viewing as another user — return to owner view first");
  }

  const owner = await prisma.user.findUnique({ where: { id: currentSession.sub } });
  if (!owner || owner.role !== "ADMIN" || !owner.active) throw new Error("Not authorized");

  if (targetUserId === owner.id) throw new Error("Cannot act as yourself");

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new Error("User not found");
  if (!target.active) throw new Error("This account is deactivated");
  if (target.role === "ADMIN") throw new Error("Cannot act as another Owner/Admin account");

  cookies().set(ACTING_AS_STASH_COOKIE, currentToken, STASH_COOKIE_OPTS);

  const targetPayload: SessionPayload = {
    sub: target.id,
    role: target.role,
    language: target.language,
    name: target.name,
    actingAs: { ownerId: owner.id, ownerName: owner.name },
  };
  await setSessionCookie(targetPayload);

  await logAudit({
    actorId: owner.id,
    action: "ACTING_AS_STARTED",
    recordType: "User",
    recordId: target.id,
    changedFields: { actingAsName: { to: target.name }, actingAsRole: { to: target.role } },
  });
}

export type StopActingAsResult = "restored" | "nothing-to-restore" | "rejected";

// Verifies the stash token's own signature/expiry AND re-checks the
// underlying owner account is still an active Admin in the DB before
// restoring — the same two checks startActingAs does on the way in. A
// forged, expired, or tampered stash, or an owner account that's since been
// deactivated or demoted, is rejected outright: cookies are cleared
// entirely (forcing a real login) rather than restoring anything.
export async function stopActingAs(): Promise<StopActingAsResult> {
  const stashToken = cookies().get(ACTING_AS_STASH_COOKIE)?.value;
  if (!stashToken) return "nothing-to-restore";

  // Capture who was being acted-as before it's overwritten, purely for the
  // audit trail below.
  const currentToken = cookies().get(SESSION_COOKIE)?.value;
  const currentSession = currentToken ? await verifySessionToken(currentToken) : null;

  const ownerSession = await verifySessionToken(stashToken);
  if (!ownerSession || ownerSession.role !== "ADMIN") {
    clearActingAsCookies();
    return "rejected";
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerSession.sub } });
  if (!owner || owner.role !== "ADMIN" || !owner.active) {
    clearActingAsCookies();
    return "rejected";
  }

  cookies().set(SESSION_COOKIE, stashToken, STASH_COOKIE_OPTS);
  cookies().delete(ACTING_AS_STASH_COOKIE);

  await logAudit({
    actorId: owner.id,
    action: "ACTING_AS_STOPPED",
    recordType: "User",
    recordId: currentSession?.sub ?? null,
  });

  return "restored";
}

// The real actor for anything a mutation needs to attribute — the Owner's
// own id/name while acting as someone else, otherwise the session's own.
// Permission checks and data-scoping queries should keep using
// session.sub/session.role directly (that's what makes the target's own
// access apply); only "who did this" writes should go through these.
export function getTrueActorId(session: SessionPayload): string {
  return session.actingAs?.ownerId ?? session.sub;
}

export function getTrueActorName(session: SessionPayload): string {
  return session.actingAs?.ownerName ?? session.name;
}

// Every real, active, non-Admin dashboard user an Owner can act as —
// broader than lib/staff.ts's STAFF_ROLES (which excludes Office
// Assistant), since an Owner needs to be able to act as one (e.g. Pedro).
export async function getActingAsCandidates() {
  return prisma.user.findMany({
    where: {
      role: { in: ["TRAINEE", "TRAINER", "SERVICE_MANAGER", "OFFICE_ASSISTANT"] },
      active: true,
      isTestAccount: false,
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}
