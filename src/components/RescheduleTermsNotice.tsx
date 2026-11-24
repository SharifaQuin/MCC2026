import { TERMS_TEXT, TERMS_SOURCE_URL, TERMS_DATE_READ } from "@/lib/rescheduleRequests";

// The published fee/skip/frequency-rate terms, shown identically to every
// customer regardless of request type or date — never computed, never
// claims a fee definitely applies. See rescheduleRequests.ts's own comment
// on TERMS_TEXT for why this is currently a placeholder, not live copy.
export default function RescheduleTermsNotice() {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
      <p className="font-medium text-neutral-900">Fee, skip, and frequency-rate terms</p>
      <p className="mt-2 whitespace-pre-line">{TERMS_TEXT}</p>
      <p className="mt-2 text-xs text-neutral-500">
        Source:{" "}
        <a href={TERMS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline">
          {TERMS_SOURCE_URL}
        </a>{" "}
        (read {TERMS_DATE_READ})
      </p>
    </div>
  );
}
