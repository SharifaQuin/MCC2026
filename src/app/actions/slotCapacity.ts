"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";
import { parseAndValidateFeed, importFeed, type ParsedFeedSummary } from "@/lib/slotFeedImport";
import { holdSlot, cityFromAddress } from "@/lib/slotRecommender";

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

async function requireSalesView() {
  const session = await getSession();
  if (!session) return null;
  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const { canView } = hasDepartmentAccess(session.role, grants, "SALES");
  return canView ? session : null;
}

// A full "27 Maple St, Irvine, CA 92604" is used as-is (city = 2nd comma
// part, matching cityFromAddress's own convention elsewhere in the engine).
// "Irvine, CA" (no street) or a bare "Irvine" are both synthesized into
// that same shape — city-level routing only, same limitation as the live
// recommender panel.
function resolveAddressAndCity(input: string): { address: string; city: string } {
  const trimmed = input.trim();
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { address: trimmed, city: cityFromAddress(trimmed) };
  }
  if (parts.length === 2) {
    return { address: `, ${parts[0]}, ${parts[1]}`, city: parts[0] };
  }
  return { address: `, ${trimmed}, CA`, city: trimmed };
}

export interface ManualBookState {
  error?: string;
  bookingId?: string;
  holdExpiresAt?: string;
}

// Books a slot directly for a repeat/call-in client with no new quote and
// no Lead record — clientName is free text purely so the rep can tell
// bookings apart (see schema.prisma's SlotBooking.clientName comment).
export async function manualBookSlotAction(
  _prevState: ManualBookState,
  formData: FormData
): Promise<ManualBookState> {
  const session = await requireSalesView();
  if (!session) return { error: "Not authorized." };

  const month = String(formData.get("month") || "");
  const date = String(formData.get("date") || "");
  const block = String(formData.get("block") || "");
  const window = String(formData.get("window") || "");
  if (!month || !date || !block || !window) return { error: "Missing slot details." };

  const clientName = String(formData.get("clientName") || "").trim();
  if (!clientName) return { error: "Enter the client's name." };

  const addressOrCity = String(formData.get("addressOrCity") || "").trim();
  if (!addressOrCity) return { error: "Enter an address or city." };

  const personHours = parseFloat(String(formData.get("personHours") || ""));
  if (!personHours || personHours <= 0) return { error: "Enter the estimated hours for this job." };

  const priceRaw = String(formData.get("price") || "").trim();
  const price = priceRaw ? parseFloat(priceRaw) : undefined;
  const frequency = String(formData.get("frequency") || "onetime");

  const { address, city } = resolveAddressAndCity(addressOrCity);

  const result = await holdSlot({
    month,
    date,
    block,
    window,
    city,
    address,
    personHours,
    price,
    frequency,
    clientName,
    repId: session.sub,
  });
  if (!result.ok) return { error: result.reason };

  revalidatePath("/sales");
  return { bookingId: result.bookingId, holdExpiresAt: result.holdExpiresAt.toISOString() };
}
