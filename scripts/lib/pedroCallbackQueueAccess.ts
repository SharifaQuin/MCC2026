// Shared logic behind scripts/revokePedroCallbackQueueAccess.ts — split out
// so e2e/pedro-callback-queue-revocation.spec.ts can exercise the exact
// same match/revoke/restore behavior against disposable test fixtures,
// not a reimplementation of it.
import type { PrismaClient } from "@prisma/client";

export interface PedroCandidate {
  id: string;
  name: string;
  email: string;
}

export async function findPedroPaezCandidates(prisma: PrismaClient): Promise<PedroCandidate[]> {
  return prisma.user.findMany({
    where: {
      role: "OFFICE_ASSISTANT",
      active: true,
      isTestAccount: false,
      name: { contains: "Pedro Paez", mode: "insensitive" },
    },
    select: { id: true, name: true, email: true },
  });
}

export interface RevokeResult {
  revoked: boolean;
  reason?: string;
  snapshot?: { userId: string; userName: string; userEmail: string; areaAccessId: string; canEdit: boolean };
}

// Re-verifies, at the moment of deletion, that exactly one live match
// exists and that it's this specific userId — never trusts an id handed in
// from an earlier lookup. Deletes ONLY the CALLBACK_QUEUE row, never any
// other area, and never touches any other user.
export async function revokeCallbackQueueGrant(prisma: PrismaClient, userId: string): Promise<RevokeResult> {
  const candidates = await findPedroPaezCandidates(prisma);
  if (candidates.length !== 1 || candidates[0].id !== userId) {
    return {
      revoked: false,
      reason: "The live OFFICE_ASSISTANT \"Pedro Paez\" match (re-checked now) doesn't resolve to exactly this one user.",
    };
  }
  const user = candidates[0];

  const grant = await prisma.areaAccess.findUnique({
    where: { userId_area: { userId, area: "CALLBACK_QUEUE" } },
  });
  if (!grant) {
    return { revoked: false, reason: "No CALLBACK_QUEUE grant exists for this user." };
  }

  const snapshot = {
    userId,
    userName: user.name,
    userEmail: user.email,
    areaAccessId: grant.id,
    canEdit: grant.canEdit,
  };
  await prisma.areaAccess.delete({ where: { id: grant.id } });
  return { revoked: true, snapshot };
}
