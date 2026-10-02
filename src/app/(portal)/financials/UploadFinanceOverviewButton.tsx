"use client";

import { useRef, useState, useTransition } from "react";
import { parseFinanceOverviewAction } from "@/app/actions/financials";

// Same "write straight into the uncontrolled native inputs" approach as
// PullFromQuickBooksButton — the whole Add/Edit Month form below is a
// plain server-action form, so setting .value directly doesn't fight React
// for control of it, and the owner still reviews every field before Save.
export default function UploadFinanceOverviewButton() {
  const labelRef = useRef<HTMLLabelElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label
        ref={labelRef}
        className={`cursor-pointer rounded-md border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 ${pending ? "pointer-events-none opacity-60" : ""}`}
      >
        {pending ? "Reading..." : "Upload Finance Overview spreadsheet (.xlsx)"}
        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const form = labelRef.current?.closest("form");
            const monthInput = form?.elements.namedItem("month") as HTMLInputElement | null;
            const monthLabelInput = form?.elements.namedItem("monthLabel") as HTMLInputElement | null;

            startTransition(async () => {
              const uploadData = new FormData();
              uploadData.set("financeOverviewFile", file);
              if (monthInput?.value) uploadData.set("monthHint", monthInput.value);

              const result = await parseFinanceOverviewAction(uploadData);
              if (result.error || !result.values || !result.month) {
                const monthsNote = result.availableMonths?.length
                  ? ` Months found in the sheet: ${result.availableMonths.map((m) => `${m.monthLabel} ${m.month.slice(0, 4)}`).join(", ")}.`
                  : "";
                setMessage({ text: `${result.error ?? "Couldn't read that file."}${monthsNote}`, tone: "error" });
                return;
              }

              if (monthInput && !monthInput.readOnly) monthInput.value = result.month;
              if (monthLabelInput) monthLabelInput.value = result.monthLabel ?? "";
              for (const [field, value] of Object.entries(result.values)) {
                const input = form?.elements.namedItem(field) as HTMLInputElement | null;
                if (input && value !== undefined) input.value = String(value);
              }

              setMessage({
                text: `Pulled ${result.monthLabel} ${result.month.slice(0, 4)} from the spreadsheet — review the numbers below, then Save.`,
                tone: "ok",
              });
            });

            e.target.value = "";
          }}
        />
      </label>
      {message && (
        <p className={`text-sm ${message.tone === "error" ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
      )}
    </div>
  );
}
