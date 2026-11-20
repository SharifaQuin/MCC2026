"use client";

import { useState, useTransition } from "react";
import {
  addPrescreenQuestionAction,
  deletePrescreenQuestionAction,
  addPrescreenOptionAction,
  deletePrescreenOptionAction,
  saveQuestionWithOptionsAction,
} from "../../actions";

type QuestionType = "SINGLE_SELECT" | "MULTI_SELECT" | "TEXT" | "DATE";

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "SINGLE_SELECT", label: "Single choice" },
  { value: "MULTI_SELECT", label: "Multiple choice" },
  { value: "TEXT", label: "Free text" },
  { value: "DATE", label: "Date" },
];

// Mirrors PrescreenQuestionCategory in prisma/schema.prisma — kept as a
// plain string list rather than importing the Prisma enum so this client
// component never pulls in @prisma/client's runtime.
const QUESTION_CATEGORIES: { value: string; label: string }[] = [
  { value: "REQUIRED", label: "Required (counts toward pass/fail)" },
  { value: "QUALIFICATION", label: "Qualification (counts toward pass/fail)" },
  { value: "PREFERRED", label: "Preferred (informational only)" },
  { value: "APPLICATION", label: "Application (informational only)" },
  { value: "CULTURE_BEHAVIORAL", label: "Culture / Behavioral (informational only)" },
  { value: "OPTIONAL", label: "Optional (informational only)" },
];

const SHOWS_ANSWER_CHOICES = new Set<QuestionType>(["SINGLE_SELECT", "MULTI_SELECT"]);

interface Option {
  id: string;
  order: number;
  textEn: string;
  points: number;
}
interface Question {
  id: string;
  order: number;
  textEn: string;
  shortLabel: string | null;
  category: string;
  type: QuestionType;
  required: boolean;
  maxLength: number | null;
  stepLabel: string | null;
  options: Option[];
}

function QuestionRow({
  question,
  jobPostingId,
  stepLabelSuggestions,
}: {
  question: Question;
  jobPostingId: string;
  stepLabelSuggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<QuestionType>(question.type);
  const optionIds = question.options.map((o) => o.id);
  const datalistId = `step-labels-${question.id}`;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-medium">
          {question.order}. {question.textEn || "(untitled question)"}
        </span>
        <span className="text-xs text-neutral-400">{open ? "Hide" : "Edit"}</span>
      </button>

      {open && (
        <form
          action={(formData) =>
            startTransition(() =>
              saveQuestionWithOptionsAction(jobPostingId, question.id, optionIds, formData)
            )
          }
          className="mt-4 space-y-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium">Question</label>
            <input
              name="textEn"
              defaultValue={question.textEn}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Step</label>
              <input
                name="stepLabel"
                list={datalistId}
                defaultValue={question.stepLabel ?? ""}
                placeholder="e.g. About You"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <datalist id={datalistId}>
                {stepLabelSuggestions.map((label) => (
                  <option key={label} value={label} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Type</label>
              <select
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as QuestionType)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Category</label>
              <select
                name="category"
                defaultValue={question.category}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                {QUESTION_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Short label</label>
              <input
                name="shortLabel"
                defaultValue={question.shortLabel ?? ""}
                placeholder="e.g. Experience"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Max length</label>
              <input
                type="number"
                name="maxLength"
                defaultValue={question.maxLength ?? ""}
                min={0}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-neutral-700">
              <input type="checkbox" name="required" defaultChecked={question.required} className="h-4 w-4" />
              Required
            </label>
          </div>

          {SHOWS_ANSWER_CHOICES.has(type) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-500">
                Answer choices — assign points toward the applicant&apos;s compatibility score
              </p>
              {question.options.map((option) => (
                <div key={option.id} className="flex items-center gap-2">
                  <input
                    name={`option_${option.id}_text`}
                    defaultValue={option.textEn}
                    placeholder="Answer text"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    name={`option_${option.id}_points`}
                    defaultValue={option.points}
                    className="w-20 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    title="Points"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(() => deletePrescreenOptionAction(jobPostingId, option.id))
                    }
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => startTransition(() => addPrescreenOptionAction(jobPostingId, question.id))}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                + Add answer choice
              </button>
            </div>
          )}

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
                if (confirm("Delete this question?")) {
                  startTransition(() => deletePrescreenQuestionAction(jobPostingId, question.id));
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

export default function PrescreenQuestionEditor({
  jobPostingId,
  questions,
}: {
  jobPostingId: string;
  questions: Question[];
}) {
  const [pending, startTransition] = useTransition();
  const stepLabelSuggestions = Array.from(
    new Set(questions.map((q) => q.stepLabel).filter((s): s is string => !!s))
  );

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <QuestionRow
          key={q.id}
          question={q}
          jobPostingId={jobPostingId}
          stepLabelSuggestions={stepLabelSuggestions}
        />
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => addPrescreenQuestionAction(jobPostingId))}
        className="w-full rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand-400 hover:text-brand-600"
      >
        + Add Prescreening Question
      </button>
    </div>
  );
}
