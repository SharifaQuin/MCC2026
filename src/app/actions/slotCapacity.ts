"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";
import { parseAndValidateFeed, importFeed, type ParsedFeedSummary } from "@/lib/slotFeedImport";

async function requireManagementEdit() {
  const session = await getSession();
  if (!session) throw new Error("Not authorized");
  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const { canEdit } = hasDepartmentAccess(session.role, grants, "MANAGEMENT");
  if (!canEdit) throw new Error("Not authorized");
  return session;
}

export interface SlotFeedImportState {
  error?: string;
  imported?: ParsedFeedSummary;
}

export async function importSlotFeedAction(
  _prevState: SlotFeedImportState,
  formData: FormData
): Promise<SlotFeedImportState> {
  let session;
  try {
    session = await requireManagementEdit();
  } catch {
    return { error: "Not authorized." };
  }

  const file = formData.get("feedFile");
  if (!(file && typeof file === "object" && "arrayBuffer" in file)) {
    return { error: "Choose a file to upload." };
  }
  try {
    const text = await (file as File).text();
    const { data, summary } = await parseAndValidateFeed(text);
    await importFeed(data, session.sub);
    revalidatePath("/management/slot-capacity");
    return { imported: summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed." };
  }
}
