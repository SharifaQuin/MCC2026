"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreLeadFromScamAction } from "../actions";

export default function RestoreScamButton({
  leadId,
  expectedUpdatedAt,
}: {
  leadId: string;
  expectedUpdatedAt: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function restore() {
    if (!confirm("Restore this lead from Scam back to its prior stage?")) return;
    setError(null);
    startTransition(async () => {
      const res = await restoreLeadFromScamAction(leadId, expectedUpdatedAt);
      if (!res.ok) {
        setError(res.error ?? "Couldn't restore this lead.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="rounded-md border border-brand-300 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      >
        {pending ? "Restoring..." : "Restore"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
