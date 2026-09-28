"use client";

import { useState, useTransition } from "react";
import { createOnboardingDocumentFromDraftAction } from "./actions";
import { fileToDataUrl } from "@/lib/fileToDataUrl";

interface DraftDoc {
  title: string;
  fileName: string;
  fileDataUrl: string;
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export default function BulkAddDocumentsForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<DraftDoc[]>([]);
  const [assignByDefault, setAssignByDefault] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand-400 hover:text-brand-600"
      >
        + Bulk Upload PDFs
      </button>
    );
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setError(null);
    try {
      const next = await Promise.all(
        Array.from(files).map(async (file) => ({
          title: titleFromFileName(file.name),
          fileName: file.name,
          fileDataUrl: await fileToDataUrl(file),
        }))
      );
      setDrafts((d) => [...d, ...next]);
    } catch {
      setError("Couldn't read one or more of those files — try again.");
    }
  }

  function updateTitle(index: number, title: string) {
    setDrafts((d) => d.map((doc, i) => (i === index ? { ...doc, title } : doc)));
  }

  function removeDraft(index: number) {
    setDrafts((d) => d.filter((_, i) => i !== index));
  }

  function reset() {
    setOpen(false);
    setDrafts([]);
    setAssignByDefault(true);
    setError(null);
    setSavedCount(0);
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-sm text-neutral-600">
        Select several PDFs at once — each becomes its own document, titled from its filename (edit any title
        below before saving).
      </p>
      <input
        type="file"
        accept="application/pdf"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="block w-full text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}

      {drafts.length > 0 && (
        <div className="space-y-2">
          {drafts.map((doc, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-neutral-200 p-2">
              <input
                value={doc.title}
                onChange={(e) => updateTitle(i, e.target.value)}
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-neutral-400">{doc.fileName}</span>
              <button
                type="button"
                onClick={() => removeDraft(i)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={assignByDefault}
          onChange={(e) => setAssignByDefault(e.target.checked)}
          className="h-4 w-4"
        />
        Automatically assign all of these to every new employee (and existing ones now)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || drafts.length === 0}
          onClick={() =>
            startTransition(async () => {
              // Submitted one at a time (not batched into one request) — a
              // handful of real PDFs together can exceed the server actions
              // body size limit, while any one file comfortably fits.
              for (const draft of drafts) {
                await createOnboardingDocumentFromDraftAction({ ...draft, assignByDefault });
                setSavedCount((n) => n + 1);
              }
              reset();
            })
          }
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending
            ? `Saving ${savedCount} of ${drafts.length}...`
            : `Add ${drafts.length} Document${drafts.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" onClick={reset} className="text-sm font-medium text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
