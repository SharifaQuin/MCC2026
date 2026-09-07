"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { submitQuizAction, QuizState } from "./actions";
import type { Language } from "@/lib/session";
import { t } from "@/lib/i18n";

interface Option {
  id: string;
  textEn: string;
  textEs: string | null;
}
interface Question {
  id: string;
  textEn: string;
  textEs: string | null;
  options: Option[];
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-5 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "..." : label}
    </button>
  );
}

interface NextModule {
  slug: string;
  titleEn: string;
  titleEs: string | null;
}

export default function QuizForm({
  moduleId,
  slug,
  questions,
  language,
  nextModule,
}: {
  moduleId: string;
  slug: string;
  questions: Question[];
  language: Language;
  nextModule: NextModule | null;
}) {
  const labels = t(language);
  const action = submitQuizAction.bind(
    null,
    moduleId,
    questions.map((q) => q.id),
    slug
  );
  const [state, formAction] = useFormState<QuizState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-8">
      {questions.map((question, qi) => (
        <fieldset key={question.id} className="rounded-lg border border-neutral-200 bg-white p-4">
          <legend className="mb-3 font-medium">
            {qi + 1}. {language === "ES" && question.textEs ? question.textEs : question.textEn}
          </legend>
          <div className="space-y-2">
            {question.options
              .filter((o) => (language === "ES" ? o.textEs || o.textEn : o.textEn))
              .map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`q_${question.id}`}
                    value={option.id}
                    required
                    className="h-4 w-4"
                  />
                  {language === "ES" && option.textEs ? option.textEs : option.textEn}
                </label>
              ))}
          </div>
        </fieldset>
      ))}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state?.submitted && (
        <div
          className={`rounded-md p-4 text-sm ${
            state.passed ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          <p className="font-medium">
            {state.scorePct}% — {state.passed ? labels.passed : labels.failed}
          </p>
          {!state.passed && <p className="mt-1">{labels.quizNeeds100}</p>}
          {state.passed && (
            <div className="mt-3">
              {nextModule ? (
                <Link
                  href={`/modules/${nextModule.slug}`}
                  className="inline-block rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  {labels.continueToModule}{" "}
                  {language === "ES" && nextModule.titleEs ? nextModule.titleEs : nextModule.titleEn}
                </Link>
              ) : (
                <div className="space-y-2">
                  <p>{labels.allModulesComplete}</p>
                  <Link
                    href="/modules"
                    className="inline-block rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    {labels.backToModulesList}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!state?.passed && (
        <SubmitButton
          label={state?.submitted && !state.passed ? labels.retakeQuiz : labels.submitQuiz}
        />
      )}
    </form>
  );
}
