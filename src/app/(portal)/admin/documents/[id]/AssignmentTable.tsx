"use client";

import { useState, useTransition } from "react";
import { assignOnboardingDocumentAction, unassignOnboardingDocumentAction } from "../actions";

export interface EmployeeAssignmentRow {
  userId: string;
  name: string;
  email: string;
  assigned: boolean;
  signedAt: string | null;
  signedName: string | null;
}

function AssignmentCheckbox({
  documentId,
  userId,
  assigned,
}: {
  documentId: string;
  userId: string;
  assigned: boolean;
}) {
  const [checked, setChecked] = useState(assigned);
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.checked;
        setChecked(next);
        startTransition(() => {
          void (next
            ? assignOnboardingDocumentAction(documentId, userId)
            : unassignOnboardingDocumentAction(documentId, userId));
        });
      }}
      className="h-4 w-4 disabled:opacity-60"
    />
  );
}

export default function AssignmentTable({
  documentId,
  rows,
}: {
  documentId: string;
  rows: EmployeeAssignmentRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Assigned</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-neutral-900">{row.name}</p>
                <p className="text-xs text-neutral-500">{row.email}</p>
              </td>
              <td className="px-4 py-3">
                <AssignmentCheckbox documentId={documentId} userId={row.userId} assigned={row.assigned} />
              </td>
              <td className="px-4 py-3">
                {row.signedAt ? (
                  <div>
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                      Signed {new Date(row.signedAt).toLocaleString()}
                    </span>
                    {row.signedName && (
                      <p className="mt-1 text-xs text-neutral-500">
                        Signed as &ldquo;{row.signedName}&rdquo;
                      </p>
                    )}
                  </div>
                ) : row.assigned ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                    Pending
                  </span>
                ) : (
                  <span className="text-xs text-neutral-400">—</span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-neutral-500">
                No employees yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
