"use client";

import { useState } from "react";
import LessonContent from "@/components/LessonContent";
import RookieContentContinueButton from "./RookieContentContinueButton";
import { t } from "@/lib/i18n";

export interface RookieContentPageBodyProps {
  contentItemId: string;
  kind: "PRACTICAL_LESSON" | "SCENARIO" | "RECAP" | "ORIENTATION";
  titleEn: string;
  titleEs: string | null;
  bodyEn?: string;
  bodyEs?: string;
  promptEn?: string | null;
  promptEs?: string | null;
  revealEn?: string | null;
  revealEs?: string | null;
  hasFutureVideoSlot?: boolean;
  videos?: { videoUrl: string; videoUrlEs: string | null; label: string }[];
  completed: boolean;
  nextHref: string;
  language: "EN" | "ES";
}

export default function RookieContentPageBody({
  contentItemId,
  kind,
  titleEn,
  titleEs,
  bodyEn,
  bodyEs,
  promptEn,
  promptEs,
  revealEn,
  revealEs,
  hasFutureVideoSlot,
  videos,
  completed,
  nextHref,
  language,
}: RookieContentPageBodyProps) {
  const labels = t(language);
  const isEs = language === "ES";
  const [revealed, setRevealed] = useState(completed);

  const continueLabel = kind === "RECAP" ? labels.rookieMarkComplete : labels.rookieMarkReviewed;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      {kind === "SCENARIO" ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {labels.rookieWhatWouldYouDo}
          </p>
          <LessonContent text={(isEs ? promptEs : promptEn) ?? ""} />
          {revealed ? (
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <LessonContent text={(isEs ? revealEs : revealEn) ?? ""} />
              <div className="mt-4">
                <RookieContentContinueButton
                  contentItemId={contentItemId}
                  nextHref={nextHref}
                  label={labels.rookieGotIt}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-3 rounded-md border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              {labels.rookieRevealAnswer}
            </button>
          )}
        </div>
      ) : (
        <div>
          {videos?.map((v, i) => {
            const videoUrl = (isEs && v.videoUrlEs) || v.videoUrl;
            return (
              <div key={i} className="mb-3 aspect-video w-full overflow-hidden rounded-md bg-black">
                <iframe
                  src={videoUrl}
                  className="h-full w-full"
                  allow="encrypted-media; fullscreen; microphone; screen-wake-lock;"
                  allowFullScreen
                  title={v.label}
                />
              </div>
            );
          })}
          <LessonContent text={(isEs ? bodyEs : bodyEn) ?? ""} />
          {hasFutureVideoSlot && <p className="mt-2 text-xs italic text-neutral-400">{labels.rookieVideoComingSoon}</p>}
          <div className="mt-4">
            <RookieContentContinueButton contentItemId={contentItemId} nextHref={nextHref} label={continueLabel} />
          </div>
        </div>
      )}
    </div>
  );
}
