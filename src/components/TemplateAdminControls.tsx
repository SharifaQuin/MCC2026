"use client";

import { useState, useTransition } from "react";
import { setDocumentTemplateActiveAction, deleteDocumentTemplateAction } from "@/app/actions/documentTemplates";

export default function TemplateAdminControls({ templateId, active }: { templateId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setDocumentTemplateActiveAction(templateId, !active))}
        className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-60"
      >
        {pending ? "..." : active ? "Deactivate" : "Activate"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this template? This can't be undone.")) return;
          setError(null);
          startTransition(async () => {
            try {
              await deleteDocumentTemplateAction(templateId);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to delete.");
            }
          });
        }}
        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
      >
        Delete
      </button>
    </div>
  );
}
