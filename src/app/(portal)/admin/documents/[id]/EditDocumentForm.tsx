"use client";

import { useState, useTransition } from "react";
import { updateOnboardingDocumentAction, deleteOnboardingDocumentAction } from "../actions";
import { fileToDataUrl } from "@/lib/fileToDataUrl";

interface Doc {
  id: string;
  title: string;
  contentText: string | null;
  fileDataUrl: string | null;
  fileName: string | null;
  assignByDefault: boolean;
}

export default function EditDocumentForm({ doc }: { doc: Doc }) {
  const [pending, startTransition] = useTransition();
  const [fileDataUrl, setFileDataUrl] = useState(doc.fileDataUrl ?? "");
  const [fileName, setFileName] = useState(doc.fileName ?? "");
  const [fileError, setFileError] = useState<string | null>(null);

  const action = updateOnboardingDocumentAction.bind(null, doc.id);

  return (
    <form
      action={(formData) => startTransition(() => action(formData))}
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium">Title</label>
        <input
          name="title"
          defaultValue={doc.title}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Text content (optional)</label>
        <textarea
          name="contentText"
          defaultValue={doc.contentText ?? ""}
          rows={8}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Or upload a PDF (optional)</label>
        <input type="hidden" name="fileDataUrl" value={fileDataUrl} />
        <input type="hidden" name="fileName" value={fileName} />
        {fileName && (
          <div className="mb-2 flex items-center gap-3">
            <p className="text-xs text-neutral-500">Attached: {fileName}</p>
            <a
              href={fileDataUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              View PDF
            </a>
            <button
              type="button"
              onClick={() => {
                setFileDataUrl("");
                setFileName("");
              }}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        )}
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
        <input
          type="checkbox"
          name="assignByDefault"
          defaultChecked={doc.assignByDefault}
          className="h-4 w-4"
        />
        Automatically assign to every new employee
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save Document"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Delete this document? This also removes it from every employee it's assigned to.")) {
              startTransition(() => deleteOnboardingDocumentAction(doc.id));
            }
          }}
          className="text-sm font-medium text-red-600 hover:underline"
        >
          Delete
        </button>
      </div>
    </form>
  );
}
