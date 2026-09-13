"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createDocumentTemplateAction,
  updateDocumentTemplateAction,
  type DocumentTemplateState,
  type FieldInput,
} from "@/app/actions/documentTemplates";
import { DOCUMENT_FIELD_TYPE_LABELS } from "@/lib/documentTemplates";
import type { DocumentFieldType } from "@prisma/client";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

export default function DocumentTemplateForm({
  templateId,
  initialTitle = "",
  initialDescription = "",
  initialBodyText = "",
  initialFields = [],
  onSaved,
}: {
  templateId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialBodyText?: string;
  initialFields?: FieldInput[];
  onSaved?: () => void;
}) {
  const action = templateId
    ? updateDocumentTemplateAction.bind(null, templateId)
    : createDocumentTemplateAction;
  const [state, formAction] = useFormState<DocumentTemplateState, FormData>(action, {});
  const [fields, setFields] = useState<FieldInput[]>(initialFields);

  if (state.success && onSaved) onSaved();

  function addField() {
    setFields([...fields, { key: "", label: "", fieldType: "TEXT", required: true }]);
  }
  function updateField(i: number, patch: Partial<FieldInput>) {
    setFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeField(i: number) {
    setFields(fields.filter((_, idx) => idx !== i));
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium">Title</label>
        <input
          name="title"
          defaultValue={initialTitle}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Description (internal, not shown to the employee)</label>
        <input
          name="description"
          defaultValue={initialDescription}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">
          Body text — use <code className="rounded bg-neutral-100 px-1">{"{{key}}"}</code> to insert a field's
          value (matching a field's Key below)
        </label>
        <textarea
          name="bodyText"
          defaultValue={initialBodyText}
          required
          rows={10}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium">Fields</p>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 p-2">
              <input
                value={f.key}
                onChange={(e) => updateField(i, { key: e.target.value })}
                placeholder="key (e.g. startingPay)"
                className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <input
                value={f.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
                placeholder="Label shown on the form"
                className="w-48 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <select
                value={f.fieldType}
                onChange={(e) => updateField(i, { fieldType: e.target.value as DocumentFieldType })}
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
              >
                {Object.entries(DOCUMENT_FIELD_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                  className="h-4 w-4"
                />
                Required
              </label>
              <button
                type="button"
                onClick={() => removeField(i)}
                className="ml-auto text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addField} className="mt-2 text-sm font-medium text-brand-700 hover:underline">
          + Add Field
        </button>
      </div>

      <input type="hidden" name="fieldsJson" value={JSON.stringify(fields)} />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton label={templateId ? "Save Changes" : "Create Template"} />
    </form>
  );
}
