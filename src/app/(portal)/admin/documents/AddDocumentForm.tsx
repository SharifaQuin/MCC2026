"use client";

import { useState, useTransition } from "react";
import { createOnboardingDocumentAction } from "./actions";
import { fileToDataUrl } from "@/lib/fileToDataUrl";

export default function AddDocumentForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fileDataUrl, setFileDataUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand-400 hover:text-brand-600"
      >
        + Add Document
      </button>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await createOnboardingDocumentAction(formData);
          setOpen(false);
          setFileDataUrl("");
          setFileName("");
        });
      }}
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium">Title</label>
        <input
          name="title"
          required
          placeholder="e.g. Employee Handbook"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Text content (optional)</label>
        <textarea
          name="contentText"
          rows={5}
          placeholder="Paste or type the document text here — leave blank if uploading a PDF instead"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Or upload a PDF (optional)</label>
        <input type="hidden" name="fileDataUrl" value={fileDataUrl} />
        <input type="hidden" name="fileName" value={fileName} />
        {fileName && <p className="mb-1 text-xs text-neutral-500">Attached: {fileName}</p>}
        <input
          type="file"
          accept="application/pdf"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileError(null);
            try {
              setFileDataUrl(await fileToDataUrl(file));
              setFileName(file.name);
            } catch {
              setFileError("Couldn't read that file — try again.");
            }
          }}
          className="block w-full text-sm"
        />
        {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="assignByDefault" className="h-4 w-4" />
        Automatically assign to every new employee (and existing ones now)
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Add Document"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
