"use client";

import { useState, useTransition } from "react";
import {
  getDocumentTextLinesAction,
  setDocumentFieldAction,
  clearDocumentFieldAction,
  rerunAutoDetectAction,
  type DocumentTextLine,
} from "../actions";

interface FieldInfo {
  page: number;
  x: number;
  y: number;
}

interface Props {
  documentId: string;
  hasFile: boolean;
  sigField: FieldInfo | null;
  dateField: FieldInfo | null;
  fieldsAutoDetected: boolean;
}

function FieldStatus({
  label,
  field,
  onClear,
  pending,
}: {
  label: string;
  field: FieldInfo | null;
  onClear: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>
        <span className="font-medium">{label}:</span>{" "}
        {field ? (
          <span className="text-green-700">Set on page {field.page + 1}</span>
        ) : (
          <span className="text-neutral-500">Not set — only the certificate page will show it</span>
        )}
      </span>
      {field && (
        <button
          type="button"
          disabled={pending}
          onClick={onClear}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default function FieldPlacementPanel({ documentId, hasFile, sigField, dateField, fieldsAutoDetected }: Props) {
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [lines, setLines] = useState<DocumentTextLine[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  if (!hasFile) return null;

  function openPicker() {
    setPicking(true);
    setLoadError(false);
    startTransition(async () => {
      const result = await getDocumentTextLinesAction(documentId);
      if (!result.length) setLoadError(true);
      setLines(result);
    });
  }

  const pageCount = lines ? Math.max(...lines.map((l) => l.page), 0) + 1 : 0;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">Signature &amp; Date Field Placement</h3>
      <p className="text-xs text-neutral-500">
        When set, the employee&apos;s typed name and the date they sign are stamped directly onto this blank in the
        document itself — not just on the trailing certificate page.
      </p>

      <FieldStatus
        label="Signature field"
        field={sigField}
        pending={pending}
        onClear={() => startTransition(() => clearDocumentFieldAction(documentId, "signature"))}
      />
      <FieldStatus
        label="Date field"
        field={dateField}
        pending={pending}
        onClear={() => startTransition(() => clearDocumentFieldAction(documentId, "date"))}
      />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => rerunAutoDetectAction(documentId))}
          className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-60"
        >
          Re-run auto-detect
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => (picking ? setPicking(false) : openPicker())}
          className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-60"
        >
          {picking ? "Hide" : "Place manually from document text"}
        </button>
      </div>

      {!fieldsAutoDetected && !sigField && !dateField && (
        <p className="text-xs text-amber-700">
          Auto-detect didn&apos;t find a Signature/Date blank in this file — it may be a plain notice with none, or
          use wording it doesn&apos;t recognize. Use &quot;Place manually&quot; below if this document does have one.
        </p>
      )}

      {picking && (
        <div className="max-h-96 space-y-4 overflow-y-auto rounded-md border border-neutral-100 bg-neutral-50 p-3">
          {lines === null && <p className="text-xs text-neutral-500">Loading document text...</p>}
          {loadError && (
            <p className="text-xs text-neutral-500">
              Couldn&apos;t extract text from this PDF (it may be a scanned image with no text layer).
            </p>
          )}
          {lines &&
            Array.from({ length: pageCount }, (_, page) => (
              <div key={page}>
                <p className="mb-1 text-xs font-semibold text-neutral-600">Page {page + 1}</p>
                <ul className="space-y-1">
                  {lines
                    .filter((l) => l.page === page)
                    .map((line, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-neutral-700">{line.text}</span>
                        <span className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              startTransition(() => setDocumentFieldAction(documentId, "signature", line))
                            }
                            className="font-medium text-brand-700 hover:underline disabled:opacity-60"
                          >
                            Set Signature
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => startTransition(() => setDocumentFieldAction(documentId, "date", line))}
                            className="font-medium text-brand-700 hover:underline disabled:opacity-60"
                          >
                            Set Date
                          </button>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
