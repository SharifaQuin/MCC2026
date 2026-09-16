"use client";

import { useState, useTransition } from "react";

interface TemplateRow {
  id: string;
  channel: "EMAIL" | "SMS";
  name: string;
  subject: string | null;
  body: string;
}

function TemplateForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: TemplateRow;
  onSubmit: (formData: FormData) => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [channel, setChannel] = useState<"EMAIL" | "SMS">(initial?.channel ?? "EMAIL");
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => onSubmit(formData))}
      className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
    >
      <div className="flex gap-2">
        <input
          name="name"
          placeholder="Template name (e.g. Thanks for Your Inquiry)"
          defaultValue={initial?.name ?? ""}
          required
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as "EMAIL" | "SMS")}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="EMAIL">Email</option>
          <option value="SMS">Text</option>
        </select>
      </div>
      {channel === "EMAIL" && (
        <input
          name="subject"
          placeholder="Subject"
          defaultValue={initial?.subject ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      )}
      <textarea
        name="body"
        placeholder={
          "Message body. Use {{firstName}} and {{position}} (Recruiting) as placeholders — " +
          "they'll auto-fill when someone picks this template."
        }
        defaultValue={initial?.body ?? ""}
        rows={5}
        required
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default function MessageTemplateManager({
  templates,
  canEdit,
  createAction,
  updateAction,
  deleteAction,
  tokenHint,
}: {
  templates: TemplateRow[];
  canEdit: boolean;
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (id: string, formData: FormData) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  tokenHint: string;
}) {
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const emailTemplates = templates.filter((t) => t.channel === "EMAIL");
  const smsTemplates = templates.filter((t) => t.channel === "SMS");

  function renderGroup(label: string, rows: TemplateRow[]) {
    return (
      <div className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-400">No {label.toLowerCase()} templates yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((t) =>
              editingId === t.id ? (
                <TemplateForm
                  key={t.id}
                  initial={t}
                  submitLabel="Save Changes"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(formData) =>
                    startTransition(async () => {
                      await updateAction(t.id, formData);
                      setEditingId(null);
                    })
                  }
                />
              ) : (
                <div key={t.id} className="rounded-md border border-neutral-200 bg-white p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{t.name}</p>
                      {t.subject && <p className="text-xs text-neutral-500">Subject: {t.subject}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(t.id)}
                          className="text-xs font-medium text-brand-700 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete "${t.name}"?`)) {
                              startTransition(async () => {
                                await deleteAction(t.id);
                              });
                            }
                          }}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{t.body}</p>
                </div>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {canEdit && (
        <div className="mb-6">
          {showNew ? (
            <TemplateForm
              submitLabel="Add Template"
              onCancel={() => setShowNew(false)}
              onSubmit={(formData) =>
                startTransition(async () => {
                  await createAction(formData);
                  setShowNew(false);
                })
              }
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + New Template
            </button>
          )}
          <p className="mt-2 text-xs text-neutral-500">{tokenHint}</p>
        </div>
      )}

      {renderGroup("Email", emailTemplates)}
      {renderGroup("Text", smsTemplates)}
    </div>
  );
}
