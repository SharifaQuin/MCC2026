"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

// Quotes are opaque JSON blobs in SalesToolData (key "quote:<id>"), not a
// relational model — see src/app/(portal)/sales/quotes/page.tsx. This adds
// the only two fields genuinely missing from that shape: a free-text next
// step and a follow-up date. Status ("outcome") is deliberately left alone
// — it's already derived from the linked Lead's stage via
// syncQuoteStatusForLead (src/lib/leads.ts) and isn't settable here.
export async function updateQuoteNextStepAction(
  quoteId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return { ok: false, error: "Not authorized." };

  const key = `quote:${quoteId}`;
  const row = await prisma.salesToolData.findUnique({ where: { key } });
  if (!row) return { ok: false, error: "Quote not found." };

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(row.value);
  } catch {
    return { ok: false, error: "This quote's saved data is corrupted and can't be edited here." };
  }

  const nextStep = String(formData.get("nextStep") ?? "").trim();
  const followUpDateRaw = String(formData.get("followUpDate") ?? "").trim();
  data.nextStep = nextStep || null;
  data.followUpDate = followUpDateRaw || null;

  await prisma.salesToolData.update({ where: { key }, data: { value: JSON.stringify(data) } });
  revalidatePath("/sales/quotes");
  return { ok: true };
}
