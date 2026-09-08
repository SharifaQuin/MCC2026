"use client";

import { useState, useTransition } from "react";
import {
  addPrescreenQuestionAction,
  deletePrescreenQuestionAction,
  addPrescreenOptionAction,
  deletePrescreenOptionAction,
  saveQuestionWithOptionsAction,
} from "../../actions";

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
  options: Option[];
}

function QuestionRow({ question, jobPostingId }: { question: Question; jobPostingId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const optionIds = question.options.map((o) => o.id);

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

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <QuestionRow key={q.id} question={q} jobPostingId={jobPostingId} />
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
