"use client";

import { useState, useTransition } from "react";
import {
  addLeadFormFieldAction,
  saveLeadFormFieldAction,
  deleteLeadFormFieldAction,
  moveLeadFormFieldAction,
} from "./actions";

interface Field {
  id: string;
  label: string;
  fieldType: "TEXT" | "TEXTAREA" | "SELECT";
  placeholder: string | null;
  required: boolean;
  options: string | null;
}

function FieldRow({
  field,
  isFirst,
  isLast,
}: {
  field: Field;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 text-left font-medium"
        >
          {field.label || "(untitled question)"}
          {field.required && <span className="ml-2 text-xs text-red-600">Required</span>}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isFirst || pending}
            onClick={() => startTransition(() => moveLeadFormFieldAction(field.id, "up"))}
            className="text-xs text-neutral-500 hover:underline disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isLast || pending}
            onClick={() => startTransition(() => moveLeadFormFieldAction(field.id, "down"))}
            className="text-xs text-neutral-500 hover:underline disabled:opacity-30"
          >
            ↓
          </button>
          <span className="text-xs text-neutral-400">{open ? "Hide" : "Edit"}</span>
        </div>
      </div>

      {open && (
        <form
          action={(formData) => startTransition(() => saveLeadFormFieldAction(field.id, formData))}
          className="mt-4 space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">Question / Label</label>
            <input
              name="label"
              defaultValue={field.label}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Field Type</label>
              <select
                name="fieldType"
                defaultValue={field.fieldType}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="TEXT">Short text</option>
                <option value="TEXTAREA">Long text</option>
                <option value="SELECT">Dropdown</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Placeholder</label>
              <input
                name="placeholder"
                defaultValue={field.placeholder ?? ""}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Dropdown choices (one per line — only used for Dropdown type)
            </label>
            <textarea
              name="options"
              rows={3}
              defaultValue={field.options ?? ""}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="required" defaultChecked={field.required} className="h-4 w-4" />
            Required
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save Question"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this question? Past leads' answers stay on their profile.")) {
                  startTransition(() => deleteLeadFormFieldAction(field.id));
                }
              }}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LeadFormFieldEditor({ fields }: { fields: Field[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <FieldRow key={f.id} field={f} isFirst={i === 0} isLast={i === fields.length - 1} />
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => addLeadFormFieldAction())}
        className="w-full rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand-400 hover:text-brand-600"
      >
        + Add Custom Question
      </button>
    </div>
  );
}
