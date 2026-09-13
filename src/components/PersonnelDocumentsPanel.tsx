"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createSignedDocumentAction,
  deleteSignedDocumentAction,
  type SignedDocumentState,
} from "@/app/actions/signedDocuments";
import type { DocumentFieldType } from "@prisma/client";

export interface SignedDocRow {
  id: string;
  templateTitle: string;
  signedAt: string | null;
  signedName: string | null;
}

export interface TemplateOption {
  id: string;
  title: string;
  fields: { key: string; label: string; fieldType: DocumentFieldType; required: boolean }[];
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Creating..." : "Create Document"}
    </button>
  );
}

function NewSignedDocumentForm({
  employeeId,
  templates,
  onClose,
}: {
  employeeId: string;
  templates: TemplateOption[];
  onClose: () => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const selected = templates.find((t) => t.id === templateId) ?? null;
  const action = selected
    ? createSignedDocumentAction.bind(null, employeeId, selected.id)
    : async (): Promise<SignedDocumentState> => ({ error: "No template selected." });
  const [state, formAction] = useFormState<SignedDocumentState, FormData>(action, {});

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  if (templates.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No active templates yet — create one under Document Templates first.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium">Template</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
      {selected?.fields.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-xs font-medium">
            {f.label}
            {f.required ? " *" : ""}
          </label>
          {f.fieldType === "CHECKBOX" ? (
            <input type="checkbox" name={`field_${f.key}`} className="h-4 w-4" />
          ) : (
            <input
              type={f.fieldType === "DATE" ? "date" : f.fieldType === "NUMBER" ? "number" : "text"}
              step={f.fieldType === "NUMBER" ? "0.01" : undefined}
              name={`field_${f.key}`}
              required={f.required}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          )}
        </div>
      ))}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

function DocRow({ employeeId, doc, canManage }: { employeeId: string; doc: SignedDocRow; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-900">{doc.templateTitle}</p>
          <p className="text-xs text-neutral-500">
            {doc.signedAt
              ? `Signed by ${doc.signedName} on ${new Date(doc.signedAt).toLocaleDateString()}`
              : "Awaiting employee signature"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {doc.signedAt ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Signed</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              Awaiting Signature
            </span>
          )}
          {canManage && !doc.signedAt && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Delete this unsigned document?")) {
                  startTransition(() => deleteSignedDocumentAction(doc.id, employeeId));
                }
              }}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PersonnelDocumentsPanel({
  employeeId,
  documents,
  templates,
  canManage,
}: {
  employeeId: string;
  documents: SignedDocRow[];
  templates: TemplateOption[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {canManage && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New Document
        </button>
      )}
      {open && <NewSignedDocumentForm employeeId={employeeId} templates={templates} onClose={() => setOpen(false)} />}

      {documents.length === 0 ? (
        <p className="text-sm text-neutral-500">No personnel documents yet.</p>
      ) : (
        <div className="space-y-3">
          {documents.map((d) => (
            <DocRow key={d.id} employeeId={employeeId} doc={d} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
