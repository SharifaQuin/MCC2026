import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { prisma } from "@/lib/prisma";
import { formatPhone } from "@/lib/formatPhone";
import QuoteNextStepForm from "./QuoteNextStepForm";

const SERVICE_LABELS: Record<string, string> = {
  standard: "Standard Clean",
  alacarte: "A la Carte",
  deep: "Top to Bottom Deep Clean",
  movein: "Move In / Move Out",
  construction: "Post Construction",
  housekeeping: "Housekeeping",
  airbnb: "Airbnb Turnover",
};

type QuoteStatus = "pending" | "won" | "lost";

interface QuoteRecord {
  id: string;
  clientName?: string;
  phone?: string;
  clientEmail?: string;
  service?: string;
  frequency?: string;
  low?: string;
  high?: string;
  status?: QuoteStatus;
  savedAt?: string;
  sentAt?: string | null;
  // Missing from a quote until someone sets it via the inline form below —
  // undefined/null both mean "not set," never computed or defaulted here.
  nextStep?: string | null;
  followUpDate?: string | null;
}

function statusBadgeClasses(status: QuoteStatus) {
  if (status === "won") return "bg-green-100 text-green-800";
  if (status === "lost") return "bg-neutral-200 text-neutral-600";
  return "bg-amber-100 text-amber-800";
}

function priceLabel(q: QuoteRecord) {
  const low = q.low ? Math.round(parseFloat(q.low)) : null;
  const high = q.high ? Math.round(parseFloat(q.high)) : null;
  if (low && high && high > low) return `$${low}–$${high}`;
  if (low) return `$${low}`;
  return "—";
}

export default async function SalesQuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  const { status: statusFilter } = await searchParams;

  const rows = await prisma.salesToolData.findMany({
    where: { key: { startsWith: "quote:" } },
  });

  const quotes: QuoteRecord[] = rows
    .map((row) => {
      try {
        return JSON.parse(row.value) as QuoteRecord;
      } catch {
        return null;
      }
    })
    .filter((q): q is QuoteRecord => q !== null)
    .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));

  const counts = {
    pending: quotes.filter((q) => (q.status || "pending") === "pending").length,
    won: quotes.filter((q) => q.status === "won").length,
    lost: quotes.filter((q) => q.status === "lost").length,
  };

  const filtered =
    statusFilter && ["pending", "won", "lost"].includes(statusFilter)
      ? quotes.filter((q) => (q.status || "pending") === statusFilter)
      : quotes;

  const filterLink = (value: string | null) =>
    value ? `/sales/quotes?status=${value}` : "/sales/quotes";

  // A quote whose linked Lead has been paused Unable-to-Contact shouldn't
  // nag anyone to schedule a next step on it — quotes are JSON blobs, not
  // relational, so quoteKey is the only link back to a Lead, and it's NOT
  // unique (multiple leads could theoretically share one), hence findMany,
  // never findFirst. Pure visibility filter: never touches the quote's own
  // stored nextStep/followUpDate/status fields.
  const candidateQuoteIds = quotes.map((q) => q.id);
  const unableToContactLeads =
    candidateQuoteIds.length > 0
      ? await prisma.lead.findMany({
          where: { quoteKey: { in: candidateQuoteIds }, stage: "UNABLE_TO_CONTACT" },
          select: { quoteKey: true },
        })
      : [];
  const unableToContactQuoteKeys = new Set(
    unableToContactLeads.map((l) => l.quoteKey).filter((k): k is string => k !== null)
  );

  // Visibility aid: pending quotes with nothing scheduled yet — a quote
  // can't just sit in Quoted forever with no next step or follow-up date.
  // Purely informational: never blocks saving, never gates a lead's stage,
  // never auto-messages anyone.
  const needsScheduling = quotes.filter(
    (q) =>
      (q.status || "pending") === "pending" &&
      (!q.nextStep || !q.followUpDate) &&
      !unableToContactQuoteKeys.has(q.id)
  );

  return (
    <div>
      <Link href="/sales" className="text-sm text-brand-700 hover:underline">
        ← Back to Sales
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <Link
          href="/sales/pricing-tool"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Open Pricing &amp; Quotes Tool
        </Link>
      </div>

      <div className="mt-4 flex gap-3 text-sm">
        <Link
          href={filterLink(null)}
          className={`rounded-md border px-3 py-1.5 ${!statusFilter ? "border-brand-600 bg-brand-50 text-brand-700" : "border-neutral-200 text-neutral-600"}`}
        >
          All ({quotes.length})
        </Link>
        <Link
          href={filterLink("pending")}
          className={`rounded-md border px-3 py-1.5 ${statusFilter === "pending" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-neutral-200 text-neutral-600"}`}
        >
          Pending ({counts.pending})
        </Link>
        <Link
          href={filterLink("won")}
          className={`rounded-md border px-3 py-1.5 ${statusFilter === "won" ? "border-green-500 bg-green-50 text-green-700" : "border-neutral-200 text-neutral-600"}`}
        >
          Won ({counts.won})
        </Link>
        <Link
          href={filterLink("lost")}
          className={`rounded-md border px-3 py-1.5 ${statusFilter === "lost" ? "border-neutral-500 bg-neutral-100 text-neutral-700" : "border-neutral-200 text-neutral-600"}`}
        >
          Lost ({counts.lost})
        </Link>
      </div>

      {needsScheduling.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            {needsScheduling.length} open quote{needsScheduling.length === 1 ? "" : "s"} need
            {needsScheduling.length === 1 ? "s" : ""} a next step scheduled
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {needsScheduling.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/sales/pricing-tool?quote=${encodeURIComponent(q.id)}`}
                  className="text-amber-800 underline hover:text-amber-900"
                >
                  {q.clientName || "(no name)"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Quote</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Next Step</th>
              <th className="px-4 py-3">Follow-up Date</th>
              <th className="px-4 py-3">Saved</th>
              <th className="px-4 py-3">Sent</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  No quotes {statusFilter ? `with status "${statusFilter}"` : "saved yet"}.
                </td>
              </tr>
            )}
            {filtered.map((q) => (
              <tr key={q.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/sales/pricing-tool?quote=${encodeURIComponent(q.id)}`} className="font-medium text-brand-700 hover:underline">
                    {q.clientName || "(no name)"}
                  </Link>
                  <div className="text-xs text-neutral-500">
                    {q.id}
                    {q.phone ? ` · ${formatPhone(q.phone)}` : ""}
                    {q.clientEmail ? ` · ${q.clientEmail}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {SERVICE_LABELS[q.service || ""] || q.service || "—"}
                  {q.frequency ? <div className="text-xs text-neutral-500">{q.frequency}</div> : null}
                </td>
                <td className="px-4 py-3">{priceLabel(q)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClasses((q.status as QuoteStatus) || "pending")}`}>
                    {q.status === "won" ? "Won" : q.status === "lost" ? "Lost" : "Pending"}
                  </span>
                </td>
                {/* An outcome (won/lost) has already been decided for those
                    quotes — they, and any quote a non-editing viewer can't
                    change, show the stored value as plain text, never a
                    form. Only a pending quote for a canEdit viewer gets the
                    inline editor, which occupies both columns at once. */}
                {(q.status || "pending") === "pending" && canEdit ? (
                  <td className="px-4 py-3" colSpan={2}>
                    <QuoteNextStepForm quoteId={q.id} nextStep={q.nextStep ?? null} followUpDate={q.followUpDate ?? null} />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-neutral-600">{q.nextStep || "—"}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {q.followUpDate ? new Date(q.followUpDate).toLocaleDateString() : "—"}
                    </td>
                  </>
                )}
                <td className="px-4 py-3 text-neutral-500">
                  {q.savedAt ? new Date(q.savedAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {q.sentAt ? new Date(q.sentAt).toLocaleDateString() : "Not sent"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
