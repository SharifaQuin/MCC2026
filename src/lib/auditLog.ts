import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

// Deliberately not wired into every existing action in the app — that would
// be a much larger, separate change. Used only for owner permission changes
// (role/area-access/approval-manager edits) and Office-Assistant-specific
// mutations, where "who changed what, when" matters most for a brand-new,
// narrowly-scoped role. Never pass a secret, a document blob, or free-text
// PII as a changed-field value — these rows are retained indefinitely and
// are themselves visible to anyone with access to query them directly.
//
// `client` defaults to the plain singleton, but a caller that needs the
// audit row to succeed or fail atomically with its own write (e.g. a
// money-figure replacement whose change record must never be lost) passes
// the `tx` from its own `prisma.$transaction(async (tx) => ...)` instead.
export async function logAudit(
  entry: {
    actorId: string | null;
    action: string;
    recordType: string;
    recordId?: string | null;
    changedFields?: Record<string, { from?: unknown; to?: unknown }>;
  },
  client: Pick<PrismaClient, "auditLogEntry"> = prisma
): Promise<void> {
  await client.auditLogEntry.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      recordType: entry.recordType,
      recordId: entry.recordId ?? null,
      changedFields: (entry.changedFields as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}
