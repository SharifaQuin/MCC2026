"use client";

import { useState, useTransition } from "react";
import { updateQuestionAction, deleteQuestionAction, createQuestionAction } from "../actions";
import type { QuestionMissRate } from "@/lib/quizStats";

interface Option {
  id: string;
  order: number;
  textEn: string;
  textEs: string | null;
  isCorrect: boolean;
}
interface Question {
  id: string;
  order: number;
  textEn: string;
  textEs: string | null;
  options: Option[];
}

function MissRateBadge({ missRate }: { missRate?: QuestionMissRate }) {
  if (!missRate || missRate.missRatePct === null) {
    return <span className="text-xs text-neutral-400">No attempts yet</span>;
  }
  const tone =
    missRate.missRatePct >= 50
      ? "bg-red-100 text-red-700"
      : missRate.missRatePct >= 25
        ? "bg-amber-100 text-amber-700"
        : "bg-neutral-100 text-neutral-500";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {missRate.missRatePct}% missed ({missRate.totalAnswered} answer
      {missRate.totalAnswered === 1 ? "" : "s"})
    </span>
  );
}

function QuestionRow({
  question,
  slug,
  missRate,
}: {
  question: Question;
  slug: string;
  missRate?: QuestionMissRate;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [correctOptionId, setCorrectOptionId] = useState(
    question.options.find((o) => o.isCorrect)?.id ?? question.options[0]?.id
  );

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-medium">
          {question.order}. {question.textEn}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <MissRateBadge missRate={missRate} />
          <span className="text-xs text-neutral-400">{open ? "Hide" : "Edit"}</span>
        </div>
      </button>

      {open && (
        <form
          action={(formData) =>
            startTransition(() => updateQuestionAction(question.id, slug, formData))
          }
          className="mt-4 space-y-4"
        >
          <input type="hidden" name="correctOptionId" value={correctOptionId} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Question (English)</label>
              <input
                name="textEn"
                defaultValue={question.textEn}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Question (Español)</label>
              <input
                name="textEs"
                defaultValue={question.textEs ?? ""}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-500">
              Options — select the radio button for the correct answer
            </p>
            {question.options.map((option) => (
              <div key={option.id} className="flex items-start gap-2">
                <input
                  type="radio"
                  checked={correctOptionId === option.id}
                  onChange={() => setCorrectOptionId(option.id)}
                  className="mt-2 h-4 w-4"
                />
                <input
                  name={`option_${option.id}_en`}
                  defaultValue={option.textEn}
                  placeholder="English"
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  name={`option_${option.id}_es`}
                  defaultValue={option.textEs ?? ""}
                  placeholder="Español"
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            ))}
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
                  startTransition(() => deleteQuestionAction(question.id, slug));
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

export default function QuestionEditor({
  moduleId,
  slug,
  questions,
  missRates,
}: {
  moduleId: string;
  slug: string;
  questions: Question[];
  missRates?: Record<string, QuestionMissRate>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {questions.map((question) => (
        <QuestionRow
          key={question.id}
          question={question}
          slug={slug}
          missRate={missRates?.[question.id]}
        />
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => createQuestionAction(moduleId, slug))}
        className="w-full rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand-400 hover:text-brand-600"
      >
        + Add Question
      </button>
    </div>
  );
}
