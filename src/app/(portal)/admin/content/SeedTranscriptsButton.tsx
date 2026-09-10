"use client";

import { useState, useTransition } from "react";
import { seedVideoTranscriptsAction } from "./actions";

export default function SeedTranscriptsButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ updated: number; skipped: number } | null>(null);

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-dashed border-neutral-300 p-4">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await seedVideoTranscriptsAction();
            setResult(res);
          })
        }
        className="rounded-md border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      >
        {pending ? "Loading..." : "Load Draft Video Transcripts (EN/ES)"}
      </button>
      <p className="text-xs text-neutral-500">
        {result
          ? `Filled in ${result.updated} lesson${result.updated === 1 ? "" : "s"}${
              result.skipped ? `, skipped ${result.skipped} that already had a transcript` : ""
            }.`
          : "One-time fill: adds the drafted English/Spanish transcript to each module's first lesson, skipping any that already have one."}
      </p>
    </div>
  );
}
