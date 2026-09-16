"use client";

import { useTransition } from "react";
import { addApplicantNoteAction } from "../actions";

interface NoteEntry {
  id: string;
  createdAt: string;
  body: string;
  authorName: string | null;
}

export default function ApplicantNotesTab({
  applicantId,
  notes,
  canEdit,
}: {
  applicantId: string;
  notes: NoteEntry[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 font-medium text-neutral-900">Internal Notes</h2>

      {canEdit && (
        <form
          action={(formData) =>
            startTransition(async () => {
              await addApplicantNoteAction(applicantId, formData);
            })
          }
          className="mb-4 space-y-2"
        >
          <textarea
            name="body"
            placeholder="Add an internal note..."
            rows={3}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Saving..." : "Add Note"}
          </button>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-400">No notes yet.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>{entry.authorName ?? "Unknown"}</span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{entry.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
