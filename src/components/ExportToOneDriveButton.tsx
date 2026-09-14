"use client";

import { useState, useTransition } from "react";
import { exportEmployeeDocumentsToOneDriveAction } from "@/app/actions/oneDriveExport";

export default function ExportToOneDriveButton({ employeeId }: { employeeId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await exportEmployeeDocumentsToOneDriveAction(employeeId);
            if (result.error) {
              setIsError(true);
              setMessage(result.error);
            } else {
              setIsError(false);
              setMessage(result.summary ?? "Done.");
            }
          });
        }}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Exporting..." : "Export Documents to OneDrive"}
      </button>
      {message && (
        <p className={`text-xs ${isError ? "text-red-600" : "text-neutral-600"}`}>{message}</p>
      )}
    </div>
  );
}
