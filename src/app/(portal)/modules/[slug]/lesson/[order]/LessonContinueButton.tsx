"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { completeLessonAction, markVideoWatchedAction } from "./actions";

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SubmitButton({
  gated,
  remainingSeconds,
  label,
  watchLabel,
  countdownLabel,
}: {
  gated: boolean;
  remainingSeconds: number;
  label: string;
  watchLabel: string;
  countdownLabel: string;
}) {
  const { pending } = useFormStatus();
  const disabled = pending || gated;

  return (
    <div className="space-y-2">
      {gated && (
        <p className="text-xs text-neutral-500">
          {watchLabel} — {countdownLabel} {formatCountdown(remainingSeconds)}
        </p>
      )}
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "..." : label}
      </button>
    </div>
  );
}

export default function LessonContinueButton({
  lessonId,
  slug,
  nextHref,
  minWatchSeconds,
  bypassGate,
  label,
  watchLabel,
  countdownLabel,
}: {
  lessonId: string;
  slug: string;
  nextHref: string;
  minWatchSeconds: number | null;
  bypassGate: boolean;
  label: string;
  watchLabel: string;
  countdownLabel: string;
}) {
  const shouldGate = !bypassGate && !!minWatchSeconds && minWatchSeconds > 0;
  const [remaining, setRemaining] = useState(minWatchSeconds ?? 0);
  const watchedMarked = useRef(false);

  useEffect(() => {
    if (!shouldGate) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const nextRemaining = Math.max(0, (minWatchSeconds ?? 0) - elapsed);
      setRemaining(nextRemaining);
      if (nextRemaining === 0 && !watchedMarked.current) {
        watchedMarked.current = true;
        void markVideoWatchedAction(lessonId, slug);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [shouldGate, minWatchSeconds, lessonId, slug]);

  const gated = shouldGate && remaining > 0;
  const action = completeLessonAction.bind(null, lessonId, slug, nextHref);

  return (
    <form action={action}>
      <SubmitButton
        gated={gated}
        remainingSeconds={remaining}
        label={label}
        watchLabel={watchLabel}
        countdownLabel={countdownLabel}
      />
    </form>
  );
}
