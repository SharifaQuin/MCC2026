"use client";

import { useState, useTransition } from "react";
import LessonContent from "@/components/LessonContent";
import { markRookieContentCompleteAction } from "@/app/actions/rookieJourney";
import { t } from "@/lib/i18n";

export interface RookieContentCardData {
  id: string;
  kind: "PRACTICAL_LESSON" | "SCENARIO" | "RECAP";
  titleEn: string;
  titleEs: string | null;
  bodyEn?: string;
  bodyEs?: string;
  promptEn?: string | null;
  promptEs?: string | null;
  revealEn?: string | null;
  revealEs?: string | null;
  hasFutureVideoSlot?: boolean;
  estimatedMinutes?: number | null;
  completed: boolean;
}

export default function RookieContentCard({ item, language }: { item: RookieContentCardData; language: "EN" | "ES" }) {
  const labels = t(language);
  const isEs = language === "ES";
  const [completed, setCompleted] = useState(item.completed);
  const [revealed, setRevealed] = useState(item.completed);
  const [isPending, startTransition] = useTransition();

  const badgeLabel =
    item.kind === "SCENARIO" ? labels.rookieScenarioBadge : item.kind === "RECAP" ? labels.rookieRecapBadge : labels.rookiePracticalBadge;

  function handleComplete() {
    setCompleted(true);
    startTransition(() => {
      markRookieContentCompleteAction(item.id);
    });
  }

  return (
    <li className="rounded-md border border-neutral-200 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="mb-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
            {badgeLabel}
          </span>
          <p className="text-sm font-medium text-neutral-900">{isEs && item.titleEs ? item.titleEs : item.titleEn}</p>
        </div>
        {completed && (
          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            {labels.lessonCompleteBadge}
          </span>
        )}
      </div>

      {item.kind === "SCENARIO" ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{labels.rookieWhatWouldYouDo}</p>
          <LessonContent text={(isEs ? item.promptEs : item.promptEn) ?? ""} />
          {revealed ? (
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <LessonContent text={(isEs ? item.revealEs : item.revealEn) ?? ""} />
              {!completed && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleComplete}
                  className="mt-3 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {labels.rookieGotIt}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-3 rounded-md border border-brand-300 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              {labels.rookieRevealAnswer}
            </button>
          )}
        </div>
      ) : (
        <div>
          <LessonContent text={(isEs ? item.bodyEs : item.bodyEn) ?? ""} />
          {item.hasFutureVideoSlot && <p className="mt-2 text-xs italic text-neutral-400">{labels.rookieVideoComingSoon}</p>}
          {!completed && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleComplete}
              className="mt-3 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {item.kind === "RECAP" ? labels.rookieMarkComplete : labels.rookieMarkReviewed}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
