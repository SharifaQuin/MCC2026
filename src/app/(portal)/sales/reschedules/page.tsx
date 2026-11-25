import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { computeBadges, findPossibleDuplicates, isAutoReceiptEnabled } from "@/lib/rescheduleRequests";
import { setAutoReceiptEnabledAction } from "./actions";
import RescheduleRequestRow, { type RescheduleRequestRowData } from "./RescheduleRequestRow";
import { getSession } from "@/lib/session";

export default async function ReschedulesQueuePage() {
  const { canEdit } = await requireDepartmentAccess("SALES");
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";

  const requests = await prisma.rescheduleRequest.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      claimedBy: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
    },
  });

  const fifoBasis = requests.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    chosenOptionDate: r.chosenOptionDate,
    chosenOptionBlock: r.chosenOptionBlock,
    chosenOptionWindow: r.chosenOptionWindow,
    workStatus: r.workStatus,
    closeOutcome: r.closeOutcome,
  }));
  const duplicateBasis = requests.map((r) => ({ id: r.id, email: r.email, currentAppointmentDate: r.currentAppointmentDate }));

  const rows: RescheduleRequestRowData[] = [];
  for (const r of requests) {
    const hasFailedMessage = r.messages.some((m) => m.status === "FAILED");
    const possibleDuplicate = findPossibleDuplicates(r, duplicateBasis).length > 0;
    const badges = await computeBadges(r, fifoBasis, hasFailedMessage, possibleDuplicate);

    rows.push({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      name: r.name,
      email: r.email,
      phone: r.phone,
      address: r.address,
      note: r.note,
      currentAppointmentDate: r.currentAppointmentDate.toISOString().slice(0, 10),
      type: r.type,
      chosenOptionDate: r.chosenOptionDate ? r.chosenOptionDate.toISOString().slice(0, 10) : null,
      chosenOptionBlock: r.chosenOptionBlock,
      chosenOptionWindow: r.chosenOptionWindow,
      preferredDateText: r.preferredDateText,
      arrivalWindow: r.arrivalWindow,
      frequency: r.frequency,
      workStatus: r.workStatus,
      decision: r.decision,
      closeOutcome: r.closeOutcome,
      closeNote: r.closeNote,
      claimedByName: r.claimedBy?.name ?? null,
      matchedInTcsAt: r.matchedInTcsAt ? r.matchedInTcsAt.toISOString() : null,
      tcsUpdatedAt: r.tcsUpdatedAt ? r.tcsUpdatedAt.toISOString() : null,
      customerInformedAt: r.customerInformedAt ? r.customerInformedAt.toISOString() : null,
      feeReview: r.feeReview,
      feeReviewNote: r.feeReviewNote,
      confirmedDate: r.confirmedDate ? r.confirmedDate.toISOString().slice(0, 10) : null,
      confirmedWindow: r.confirmedWindow,
      confirmedOriginalOutcome: r.confirmedOriginalOutcome,
      confirmedRecurrenceText: r.confirmedRecurrenceText,
      confirmedFeeNotice: r.confirmedFeeNotice,
      offerOptionDate: r.offerOptionDate ? r.offerOptionDate.toISOString().slice(0, 10) : null,
      offerOptionBlock: r.offerOptionBlock,
      offerOptionWindow: r.offerOptionWindow,
      offerAt: r.offerAt ? r.offerAt.toISOString() : null,
      offerText: r.offerText,
      offerOutcome: r.offerOutcome,
      messages: r.messages.map((m) => ({
        id: m.id,
        channel: m.channel,
        kind: m.kind,
        status: m.status,
        body: m.body,
        errorMessage: m.errorMessage,
        sentAt: m.sentAt ? m.sentAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
      })),
      notes: r.notes.map((n) => ({ id: n.id, body: n.body, authorName: n.author?.name ?? null, createdAt: n.createdAt.toISOString() })),
      badges,
    });
  }

  // "the app's existing public base URL helper/setting" — no shared
  // function exists anywhere in this codebase, just the established
  // inline-read convention (process.env.NEXT_PUBLIC_APP_URL, used the
  // same way at every other call site) — reused here rather than
  // introducing a new helper module for a single call site.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const formUrl = appUrl ? `${appUrl}/reschedule` : null;

  const autoReceiptEnabled = await isAutoReceiptEnabled();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Reschedule Requests</h1>

      <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-sm font-medium text-neutral-900">Open request form</p>
        {formUrl ? (
          <>
            <p className="mt-1 text-sm">
              <a href={formUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline">
                Open request form
              </a>
            </p>
            <p className="mt-1 select-all break-all text-xs text-neutral-600">{formUrl}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">Form link unavailable</p>
        )}
      </div>

      {isAdmin && (
        <form action={setAutoReceiptEnabledAction} className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <input type="checkbox" id="auto-receipt-enabled" name="enabled" defaultChecked={autoReceiptEnabled} />
          <label htmlFor="auto-receipt-enabled" className="text-neutral-700">
            Send the automatic email receipt on new requests (off by default until wording is approved)
          </label>
          <button type="submit" className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50">
            Save
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No reschedule requests yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <RescheduleRequestRow key={row.id} request={row} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
