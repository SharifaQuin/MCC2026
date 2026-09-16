"use client";

import { useState, useTransition } from "react";
import {
  saveInterviewAnswersAction,
  saveInterviewScorecardAction,
  deleteInterviewScorecardAction,
} from "../actions";
import { INTERVIEW_RECOMMENDATION_LABELS } from "@/lib/recruiting";

interface Question {
  id: string;
  competency: string;
  textEn: string;
  textEs: string | null;
  whatToListenFor: string | null;
  roleScope: string;
}

interface CompetencyScore {
  competency: string;
  score: number | null;
  evidence: string | null;
}

interface Scorecard {
  id: string;
  evaluatorName: string | null;
  recommendation: string | null;
  rationale: string | null;
  concerns: string | null;
  createdAt: string;
  competencyScores: CompetencyScore[];
}

function ScorecardCard({
  applicantId,
  scorecard,
  canEdit,
}: {
  applicantId: string;
  scorecard: Scorecard;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
        <span>
          {scorecard.evaluatorName ?? "Unknown evaluator"} — {new Date(scorecard.createdAt).toLocaleString()}
        </span>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteInterviewScorecardAction(applicantId, scorecard.id);
              })
            }
            className="text-red-600 hover:underline disabled:opacity-60"
          >
            Delete
          </button>
        )}
      </div>
      <ul className="mb-2 space-y-1 text-sm">
        {scorecard.competencyScores.map((cs) => (
          <li key={cs.competency}>
            <span className="font-medium text-neutral-800">{cs.competency}:</span>{" "}
            <span className="text-neutral-700">{cs.score ?? "—"}/5</span>
            {cs.evidence && <p className="ml-1 text-xs text-neutral-500">{cs.evidence}</p>}
          </li>
        ))}
      </ul>
      {scorecard.recommendation && (
        <p className="text-sm font-medium text-neutral-900">
          Recommendation: {INTERVIEW_RECOMMENDATION_LABELS[scorecard.recommendation] ?? scorecard.recommendation}
        </p>
      )}
      {scorecard.rationale && <p className="mt-1 text-sm text-neutral-700">{scorecard.rationale}</p>}
      {scorecard.concerns && (
        <p className="mt-1 text-sm text-amber-700">Concerns: {scorecard.concerns}</p>
      )}
    </div>
  );
}

export default function InterviewTab({
  applicantId,
  questions,
  answers,
  competencies,
  scorecards,
  canEdit,
}: {
  applicantId: string;
  questions: Question[];
  answers: Record<string, string | null>;
  competencies: string[];
  scorecards: Scorecard[];
  canEdit: boolean;
}) {
  const [answersPending, startAnswersTransition] = useTransition();
  const [scorecardPending, startScorecardTransition] = useTransition();
  const [showNewScorecard, setShowNewScorecard] = useState(false);
  const questionIds = questions.map((q) => q.id);

  return (
    <div className="space-y-6">
      <form
        action={(formData) =>
          startAnswersTransition(async () => {
            await saveInterviewAnswersAction(applicantId, questionIds, formData);
          })
        }
        className="rounded-lg border border-neutral-200 bg-white p-4"
      >
        <h2 className="mb-3 font-medium text-neutral-900">Structured Interview Questions</h2>
        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={q.id}>
              <p className="text-xs font-medium uppercase tracking-wide text-brand-700">{q.competency}</p>
              <label className="mb-1 block text-sm font-medium text-neutral-800">
                {i + 1}. {q.textEn}
              </label>
              {q.textEs && <p className="mb-1 text-xs italic text-neutral-500">{q.textEs}</p>}
              {q.whatToListenFor && (
                <p className="mb-1 text-xs text-neutral-400">What to listen for: {q.whatToListenFor}</p>
              )}
              <textarea
                name={`answer_${q.id}`}
                rows={2}
                placeholder="What did the candidate say?"
                defaultValue={answers[q.id] ?? ""}
                disabled={!canEdit}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
          {questions.length === 0 && (
            <p className="text-sm text-neutral-400">
              No interview questions on this posting yet — add some from the job posting page.
            </p>
          )}
        </div>
        {canEdit && questions.length > 0 && (
          <button
            type="submit"
            disabled={answersPending}
            className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {answersPending ? "Saving..." : "Save Answers"}
          </button>
        )}
      </form>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-neutral-900">Interview Scorecards</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowNewScorecard((v) => !v)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {showNewScorecard ? "Cancel" : "+ Add Scorecard"}
            </button>
          )}
        </div>

        {scorecards.length === 0 && !showNewScorecard && (
          <p className="text-sm text-neutral-400">
            No scorecards yet — complete one within an hour of the interview, while it&apos;s fresh.
          </p>
        )}

        <div className="space-y-3">
          {scorecards.map((sc) => (
            <ScorecardCard key={sc.id} applicantId={applicantId} scorecard={sc} canEdit={canEdit} />
          ))}
        </div>

        {showNewScorecard && (
          <form
            action={(formData) =>
              startScorecardTransition(async () => {
                await saveInterviewScorecardAction(applicantId, null, competencies, formData);
                setShowNewScorecard(false);
              })
            }
            className="mt-3 space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4"
          >
            <p className="text-xs text-neutral-500">
              Rating scale: 5 — Exceptional | 4 — Strong | 3 — Meets Bar | 2 — Below Bar | 1 — Not
              Demonstrated
            </p>
            {competencies.map((competency, i) => (
              <div key={competency} className="grid grid-cols-[1fr_80px] gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-700">{competency}</label>
                  <input
                    name={`evidence_${i}`}
                    placeholder="Evidence cited"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-700">Score</label>
                  <select
                    name={`score_${i}`}
                    defaultValue=""
                    className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Overall Recommendation</label>
              <select
                name="recommendation"
                defaultValue=""
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {Object.entries(INTERVIEW_RECOMMENDATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Rationale</label>
              <textarea
                name="rationale"
                rows={2}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Concerns / Watch-Outs</label>
              <textarea
                name="concerns"
                rows={2}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={scorecardPending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {scorecardPending ? "Saving..." : "Save Scorecard"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
