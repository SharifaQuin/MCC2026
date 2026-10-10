import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Deliberately not wired into every existing action in the app — that would
// be a much larger, separate change. Used only for owner permission changes
// (role/area-access/approval-manager edits) and Office-Assistant-specific
// mutations, where "who changed what, when" matters most for a brand-new,
// narrowly-scoped role. Never pass a secret, a document blob, or free-text
// PII as a changed-field value — these rows are retained indefinitely and
// are themselves visible to anyone with access to query them directly.
export async function logAudit(entry: {
  actorId: string | null;
  action: string;
  recordType: string;
  recordId?: string | null;
  changedFields?: Record<string, { from?: unknown; to?: unknown }>;
}): Promise<void> {
  await prisma.auditLogEntry.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      recordType: entry.recordType,
      recordId: entry.recordId ?? null,
      changedFields: (entry.changedFields as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}
