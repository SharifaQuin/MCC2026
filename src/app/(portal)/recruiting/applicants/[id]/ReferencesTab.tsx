"use client";

import { useState, useTransition } from "react";
import { addReferenceCheckAction, deleteReferenceCheckAction } from "../actions";
import { REFERENCE_VERDICT_LABELS } from "@/lib/recruiting";

interface ReferenceCheckEntry {
  id: string;
  referenceName: string | null;
  referenceRelationship: string | null;
  durationKnown: string | null;
  referencePhone: string | null;
  calledAt: string | null;
  capacityDuration: string | null;
  responsibilities: string | null;
  strengths: string | null;
  growthAreas: string | null;
  customerFacing: string | null;
  handledFeedback: string | null;
  wouldRehire: string | null;
  anythingElse: string | null;
  verdict: string | null;
  redFlagsSurfaced: string | null;
  completedByName: string | null;
  createdAt: string;
}

const QUESTIONS: { field: keyof ReferenceCheckEntry; label: string; labelEs: string }[] = [
  {
    field: "capacityDuration",
    label: "In what capacity did you work with them, and for how long?",
    labelEs: "¿En qué capacidad trabajó con [candidato], y por cuánto tiempo?",
  },
  {
    field: "responsibilities",
    label: "What were their main responsibilities?",
    labelEs: "¿Cuáles eran las responsabilidades principales de [candidato]?",
  },
  {
    field: "strengths",
    label: "What were their strongest areas?",
    labelEs: "¿Cuáles eran las áreas más fuertes de [candidato]?",
  },
  {
    field: "growthAreas",
    label: "Where did they have opportunities to grow?",
    labelEs: "¿Dónde tenía [candidato] oportunidades para mejorar?",
  },
  {
    field: "customerFacing",
    label: "How were they in customer-facing situations?",
    labelEs: "¿Cómo era [candidato] con los clientes?",
  },
  {
    field: "handledFeedback",
    label: "How did they handle disagreement, feedback, or mistakes?",
    labelEs: "¿Cómo manejaba [candidato] el desacuerdo, los comentarios o los errores?",
  },
  {
    field: "wouldRehire",
    label: "Would you hire them again? Why or why not?",
    labelEs: "¿Volvería a contratar a [candidato]? ¿Por qué sí o por qué no?",
  },
  {
    field: "anythingElse",
    label: "Is there anything I haven't asked that I should?",
    labelEs: "¿Hay algo que no le he preguntado que debería preguntar?",
  },
];

function ReferenceCard({
  applicantId,
  entry,
  canEdit,
}: {
  applicantId: string;
  entry: ReferenceCheckEntry;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="font-medium text-neutral-900">{entry.referenceName ?? "(no name entered)"}</p>
          <p className="text-xs text-neutral-500">
            {entry.referenceRelationship}
            {entry.durationKnown ? ` — ${entry.durationKnown}` : ""}
            {entry.referencePhone ? ` · ${entry.referencePhone}` : ""}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteReferenceCheckAction(applicantId, entry.id);
              })
            }
            className="text-xs text-red-600 hover:underline disabled:opacity-60"
          >
            Delete
          </button>
        )}
      </div>
      <dl className="space-y-2 text-sm">
        {QUESTIONS.map((q) =>
          entry[q.field] ? (
            <div key={q.field}>
              <dt className="text-xs text-neutral-500">{q.label}</dt>
              <dd className="text-neutral-800">{entry[q.field] as string}</dd>
            </div>
          ) : null
        )}
      </dl>
      {entry.verdict && (
        <p className="mt-2 text-sm font-medium text-neutral-900">
          Verdict: {REFERENCE_VERDICT_LABELS[entry.verdict] ?? entry.verdict}
        </p>
      )}
      {entry.redFlagsSurfaced && (
        <p className="mt-1 text-sm text-amber-700">Red flags: {entry.redFlagsSurfaced}</p>
      )}
      <p className="mt-2 text-xs text-neutral-400">
        Logged by {entry.completedByName ?? "Unknown"} on {new Date(entry.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

export default function ReferencesTab({
  applicantId,
  references,
  canEdit,
}: {
  applicantId: string;
  references: ReferenceCheckEntry[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Conduct at least 2 reference calls per finalist — at least one should be a former direct
        supervisor. Read questions as written.
      </div>

      {references.map((entry) => (
        <ReferenceCard key={entry.id} applicantId={applicantId} entry={entry} canEdit={canEdit} />
      ))}

      {references.length === 0 && !showNew && (
        <p className="text-sm text-neutral-400">No reference calls logged yet.</p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {showNew ? "Cancel" : "+ Add Reference Check"}
        </button>
      )}

      {showNew && (
        <form
          action={(formData) =>
            startTransition(async () => {
              await addReferenceCheckAction(applicantId, formData);
              setShowNew(false);
            })
          }
          className="space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Reference Name</label>
              <input name="referenceName" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Relationship</label>
              <input
                name="referenceRelationship"
                placeholder="e.g. Former supervisor"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">How long they worked together</label>
              <input name="durationKnown" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Reference Phone</label>
              <input name="referencePhone" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Date of Call</label>
              <input type="date" name="calledAt" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </div>
          </div>

          {QUESTIONS.map((q) => (
            <div key={q.field}>
              <label className="mb-1 block text-xs font-medium text-neutral-700">{q.label}</label>
              <p className="mb-1 text-xs italic text-neutral-500">{q.labelEs}</p>
              <textarea name={q.field} rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </div>
          ))}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">Overall Reference Verdict</label>
            <select name="verdict" defaultValue="" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="">Select...</option>
              {Object.entries(REFERENCE_VERDICT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">Red Flags Surfaced</label>
            <textarea name="redFlagsSurfaced" rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save Reference Check"}
          </button>
        </form>
      )}
    </div>
  );
}
