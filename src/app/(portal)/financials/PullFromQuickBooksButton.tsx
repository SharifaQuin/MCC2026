"use client";

import { useRef, useState, useTransition } from "react";
import { pullFromQuickBooksAction } from "@/app/actions/financials";

// Sets values directly on the plain <input name="..."> fields in the
// entry form below it — those are uncontrolled native inputs (the whole
// page is a server-rendered form posted via a server action), so writing
// to .value directly is safe and doesn't fight React for control of them.
const FIELD_MAP: Record<string, string> = {
  totalIncome: "revenueTotal",
  totalCogs: "cogsTotal",
  grossProfit: "grossProfit",
  totalExpenses: "opexTotal",
  netIncome: "netProfit",
};

export default function PullFromQuickBooksButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        onClick={() => {
          const form = buttonRef.current?.closest("form");
          const monthInput = form?.elements.namedItem("month") as HTMLInputElement | null;
          const month = monthInput?.value.trim() ?? "";

          startTransition(async () => {
            const result = await pullFromQuickBooksAction(month);
            if (result.error || !result.summary) {
              setMessage({ text: result.error ?? "Something went wrong.", tone: "error" });
              return;
            }
            for (const [qbKey, fieldName] of Object.entries(FIELD_MAP)) {
              const value = result.summary[qbKey as keyof typeof result.summary];
              const input = form?.elements.namedItem(fieldName) as HTMLInputElement | null;
              if (input) input.value = String(value);
            }
            setMessage({
              text: "Pulled revenue, COGS, gross profit, expenses, and net profit — review the numbers below, then Save.",
              tone: "ok",
            });
          });
        }}
        className="rounded-md border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-60"
      >
        {pending ? "Pulling..." : "Pull from QuickBooks"}
      </button>
      {message && (
        <p className={`text-sm ${message.tone === "error" ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
      )}
    </div>
  );
}
