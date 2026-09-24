"use client";

import { useRef, useState } from "react";
import Logo from "@/components/Logo";
import ResumeUpload from "@/components/ResumeUpload";
import Button from "@/components/ds/Button";
import type { UtmParams } from "@/lib/recruiting";
import { submitApplicationAction } from "./actions";

type QuestionOption = { id: string; textEn: string };
type Question = {
  id: string;
  textEn: string;
  category: string;
  type: "SINGLE_SELECT" | "MULTI_SELECT" | "TEXT" | "DATE";
  required: boolean;
  maxLength: number | null;
  stepLabel: string | null;
  conditionalOnOptionId: string | null;
  options: QuestionOption[];
};

type Posting = {
  titleEn: string;
  positionType: string | null;
  descriptionEn: string;
  resumeRequired: boolean;
  prescreenQuestions: Question[];
};

// The Cleaning Technician application's 6 wizard steps, in the order the
// posting's questions are seeded — driven entirely by each question's
// `stepLabel`, so adding/reordering/relabeling questions never requires a
// component change. Two fixed non-question steps (identity fields on
// "About You", resume upload on "Final Information") are spliced in below.
function useSteps(questions: Question[]) {
  const labels: string[] = [];
  for (const q of questions) {
    if (q.stepLabel && !labels.includes(q.stepLabel)) labels.push(q.stepLabel);
  }
  return labels;
}

function isVisible(q: Question, selectedOptionIds: Set<string>) {
  return !q.conditionalOnOptionId || selectedOptionIds.has(q.conditionalOnOptionId);
}

export default function ApplyPageV2({
  posting,
  slug,
  src,
  utm,
  errorMessage,
}: {
  posting: Posting;
  slug: string;
  src: string;
  utm: UtmParams;
  errorMessage: string | null;
}) {
  const stepLabels = useSteps(posting.prescreenQuestions);
  // -1 = intro splash (unnumbered); 0..stepLabels.length-1 = the 6 wizard steps.
  const [stepIndex, setStepIndex] = useState(-1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [identity, setIdentity] = useState({ fullName: "", email: "", phone: "", city: "" });

  const selectedOptionIds = new Set(Object.values(selections).flat());

  function setSingle(questionId: string, optionId: string) {
    setSelections((prev) => ({ ...prev, [questionId]: [optionId] }));
  }
  function toggleMulti(questionId: string, optionId: string) {
    setSelections((prev) => {
      const current = prev[questionId] ?? [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [questionId]: next };
    });
  }
  function setText(questionId: string, value: string) {
    setTextValues((prev) => ({ ...prev, [questionId]: value }));
  }

  const currentStepLabel = stepIndex >= 0 ? stepLabels[stepIndex] : null;

  function questionsForStep(label: string) {
    return posting.prescreenQuestions.filter((q) => q.stepLabel === label && isVisible(q, selectedOptionIds));
  }

  function validateCurrentStep(): string | null {
    if (currentStepLabel === "About You") {
      if (!identity.fullName.trim() || !identity.email.includes("@") || !identity.phone.trim()) {
        return "Please fill out your name, email, and phone to continue.";
      }
    }
    for (const q of currentStepLabel ? questionsForStep(currentStepLabel) : []) {
      if (!q.required) continue;
      if (q.type === "SINGLE_SELECT" && !(selections[q.id]?.length)) return "Please answer every question to continue.";
      if (q.type === "MULTI_SELECT" && !(selections[q.id]?.length)) return "Please select at least one option to continue.";
      if ((q.type === "TEXT" || q.type === "DATE") && !textValues[q.id]?.trim()) {
        return "Please fill out every required field to continue.";
      }
    }
    return null;
  }

  function goNext() {
    const error = validateCurrentStep();
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setStepIndex((i) => Math.min(i + 1, stepLabels.length - 1));
  }
  function goBack() {
    setStepError(null);
    setStepIndex((i) => Math.max(i - 1, -1));
  }

  const isLastStep = stepIndex === stepLabels.length - 1;
  const formRef = useRef<HTMLFormElement>(null);

  // Deliberately NOT a plain <form action={submitApplicationAction}>: Next
  // 14's form-action progressive-enhancement capture is unreliable for a
  // controlled field whose value changed in the same step as the submit
  // click (confirmed by direct testing — the DOM/state value is correct,
  // but the framework's own FormData snapshot drops it). Building FormData
  // ourselves from the live form at the moment of the click and calling
  // the server action directly sidesteps that entirely.
  async function handleSubmitClick() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setSubmitting(true);
    await submitApplicationAction(slug, fd);
  }

  function renderQuestion(q: Question) {
    const counter =
      q.maxLength && (q.type === "TEXT" || q.type === "DATE") ? (
        <p className="mt-1 text-right text-xs text-neutral-400">
          {(textValues[q.id] ?? "").length}/{q.maxLength}
        </p>
      ) : null;

    return (
      <div key={q.id}>
        <p className="mb-2 text-sm font-medium text-neutral-800">
          {q.textEn}
          {q.required && " *"}
        </p>

        {q.type === "SINGLE_SELECT" && (
          <div className="space-y-2">
            {q.options.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-700 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
              >
                <input
                  type="radio"
                  name={`question_${q.id}`}
                  value={opt.id}
                  checked={selections[q.id]?.[0] === opt.id}
                  onChange={() => setSingle(q.id, opt.id)}
                  className="h-4 w-4"
                />
                {opt.textEn}
              </label>
            ))}
          </div>
        )}

        {q.type === "MULTI_SELECT" && (
          <div className="space-y-2">
            {q.options.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-700 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
              >
                <input
                  type="checkbox"
                  name={`question_${q.id}`}
                  value={opt.id}
                  checked={selections[q.id]?.includes(opt.id) ?? false}
                  onChange={() => toggleMulti(q.id, opt.id)}
                  className="h-4 w-4"
                />
                {opt.textEn}
              </label>
            ))}
          </div>
        )}

        {q.type === "TEXT" && (
          <>
            <textarea
              name={`question_${q.id}`}
              value={textValues[q.id] ?? ""}
              onChange={(e) => setText(q.id, e.target.value)}
              rows={3}
              className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm"
            />
            {counter}
          </>
        )}

        {q.type === "DATE" && (
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/DD/YYYY"
            name={`question_${q.id}`}
            value={textValues[q.id] ?? ""}
            onChange={(e) => setText(q.id, e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm"
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:py-10">
      <Logo />

      {errorMessage && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {stepIndex === -1 ? (
        <div className="mt-6 space-y-4">
          <h1 className="text-2xl font-bold text-brand-800">Join Mama&apos;s Cleaning Crew</h1>
          <p className="text-neutral-700">We&apos;re excited that you&apos;re interested in joining our team!</p>
          <p className="text-sm text-neutral-600">
            At Mama&apos;s Cleaning Crew, we&apos;re looking for dependable, hardworking people who take
            pride in their work, care about the people around them, and are willing to learn the Mama&apos;s
            way.
          </p>
          <p className="text-sm text-neutral-600">This application should take approximately 5–7 minutes.</p>
          <p className="text-sm text-neutral-600">
            Don&apos;t worry about giving us the &ldquo;perfect&rdquo; answer. We want to learn about your
            experience, how you approach different situations, and what you&apos;re looking for in your next
            workplace.
          </p>
          <p className="font-medium text-brand-700">Let&apos;s get started.</p>
          <Button className="w-full" size="lg" onClick={() => setStepIndex(0)}>
            Continue
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-1.5">
            {stepLabels.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-gold-500" : "bg-neutral-200"}`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Step {stepIndex + 1} of {stepLabels.length} — {currentStepLabel}
          </p>

          <form
            ref={formRef}
            className="mt-4 space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <input type="hidden" name="src" value={src} />
            <input type="hidden" name="utmSource" value={utm.utmSource ?? ""} />
            <input type="hidden" name="utmMedium" value={utm.utmMedium ?? ""} />
            <input type="hidden" name="utmCampaign" value={utm.utmCampaign ?? ""} />
            <input type="hidden" name="utmContent" value={utm.utmContent ?? ""} />
            <input type="hidden" name="utmTerm" value={utm.utmTerm ?? ""} />

            {/* Every step's fields stay mounted the whole time (just hidden
                when inactive) so the final native form submission — which
                only sees whatever is currently in the DOM — carries every
                answer from every step, not just the one on screen. Answers
                themselves live in controlled state above, so going Back
                and Forth never loses anything either. */}
            {stepLabels.map((label, i) => (
              <div key={label} data-step-label={label} className={i === stepIndex ? "space-y-5" : "hidden"}>
                {label === "About You" && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">Full Name *</label>
                      <input
                        name="fullName"
                        value={identity.fullName}
                        onChange={(e) => setIdentity((p) => ({ ...p, fullName: e.target.value }))}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Mobile Phone Number *
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={identity.phone}
                        onChange={(e) => setIdentity((p) => ({ ...p, phone: e.target.value }))}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={identity.email}
                        onChange={(e) => setIdentity((p) => ({ ...p, email: e.target.value }))}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        What city do you currently live in? *
                      </label>
                      <input
                        name="city"
                        value={identity.city}
                        onChange={(e) => setIdentity((p) => ({ ...p, city: e.target.value }))}
                        className="w-full rounded-md border border-neutral-300 px-3 py-2.5"
                      />
                    </div>
                  </>
                )}

                {label === "Realistic Job Preview" && (
                  <div className="rounded-lg bg-brand-50 p-4 text-sm text-neutral-700">
                    <p className="mb-2 font-semibold text-brand-800">One Last Thing...</p>
                    <p>
                      Professional cleaning is active, physical work. Our Cleaning Technicians may spend
                      much of their workday standing, walking, bending, reaching, cleaning bathrooms and
                      kitchens, carrying cleaning supplies, moving efficiently between tasks, and traveling
                      between client locations.
                    </p>
                    <p className="mt-2">
                      Mama&apos;s Cleaning Crew also has specific cleaning procedures and quality standards
                      that employees are expected to learn and follow.
                    </p>
                  </div>
                )}

                {questionsForStep(label).map((q) => renderQuestion(q))}

                {label === "Final Information" && (
                  <div className="border-t border-neutral-200 pt-5">
                    <ResumeUpload required={posting.resumeRequired} />
                    {!posting.resumeRequired && (
                      <p className="mt-1 text-xs text-neutral-400">
                        If you have a resume, you&apos;re welcome to upload it. A resume is optional for
                        Cleaning Technician applicants.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {stepError && <p className="text-sm text-red-600">{stepError}</p>}

            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={goBack} className="flex-1">
                Back
              </Button>
              {isLastStep ? (
                <Button type="button" onClick={handleSubmitClick} disabled={submitting} className="flex-1">
                  {submitting ? "Submitting…" : "Submit My Application"}
                </Button>
              ) : (
                <Button type="button" onClick={goNext} className="flex-1">
                  Continue
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
