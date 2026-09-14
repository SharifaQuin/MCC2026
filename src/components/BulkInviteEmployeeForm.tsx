"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { bulkInviteAction, BulkInviteState } from "@/app/actions/employeeBulkInvite";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Uploading..." : "Upload & Create Invites"}
    </button>
  );
}

export default function BulkInviteEmployeeForm() {
  const [state, formAction] = useFormState<BulkInviteState, FormData>(bulkInviteAction, {});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">CSV File</label>
          <input
            type="file"
            name="csvFile"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Columns: name, email, role, hireDate, phone, address, employmentType, officeLocation,
            crewType, managerName. Only name and email are required — role defaults to Trainee,
            employmentType is Full-time or Part-time. A header row is fine and will be skipped
            automatically. Re-uploading a row whose email already exists fills in any of those
            extra columns on their existing profile instead of erroring (it never changes their
            name, role, or hire date).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sendInviteNow" defaultChecked className="h-4 w-4" />
          Send invite links now (uncheck to just add everyone to the roster and invite each
          person later)
        </label>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton />
      </form>

      {state?.results && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Results</h2>
          <div className="overflow-hidden rounded-md border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Invite Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {state.results.map((row, i) => (
                  <tr key={`${row.email}-${i}`}>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2">
                      {row.inviteUrl ? (
                        <div className="flex items-center gap-2">
                          <code className="max-w-[16rem] flex-1 truncate rounded bg-neutral-100 px-2 py-1 text-xs">
                            {row.inviteUrl}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(row.inviteUrl!);
                              setCopiedIndex(i);
                              setTimeout(() => setCopiedIndex(null), 2000);
                            }}
                            className="rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-white"
                          >
                            {copiedIndex === i ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      ) : row.addedWithoutInvite ? (
                        <span className="text-xs text-blue-700">Added to roster (no invite sent)</span>
                      ) : row.updated ? (
                        <span className="text-xs text-green-700">Updated existing profile</span>
                      ) : (
                        <span className="text-xs text-red-600">{row.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
