import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getLessonDetail, markModuleInProgress } from "@/lib/courses";
import { getRookieSequenceNextHref } from "@/lib/rookieJourney";
import { requireOnboardingComplete } from "@/lib/onboarding";
import { t } from "@/lib/i18n";
import LessonContinueButton from "./LessonContinueButton";
import LessonContent from "@/components/LessonContent";

export default async function LessonPage({
  params,
}: {
  params: { slug: string; order: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  await requireOnboardingComplete(session);
  const labels = t(session.language);

  const order = parseInt(params.order, 10);
  if (!Number.isFinite(order) || order < 1) notFound();

  const detail = await getLessonDetail(params.slug, order, session.sub);
  if (!detail) notFound();

  // A Rookie Day hand-picks individual lessons out of order across many
  // modules (e.g. Day 4 assigns Module 9 Lesson 9 without requiring
  // Modules 1-8, or even the rest of Module 9, to be completed first), so
  // neither the whole-module lock (previous module not yet completed) nor
  // the "finish earlier lessons in this module first" gate applies to a
  // lesson reached through today's Rookie Day sequence — see
  // getRookieSequenceNextHref's own comment for why.
  const rookieNextHref =
    session.role === "TRAINEE" ? await getRookieSequenceNextHref(session.sub, detail.lesson.id) : null;
  const inRookieSequence = rookieNextHref !== null;

  if (detail.locked && !inRookieSequence) redirect("/modules");
  if (detail.priorIncomplete && !inRookieSequence) {
    redirect(`/modules/${params.slug}/lesson/${detail.firstIncompleteOrder}`);
  }

  await markModuleInProgress(session.sub, detail.module.id);

  const lang = session.language;
  const lTitle =
    lang === "ES" && detail.lesson.titleEs ? detail.lesson.titleEs : detail.lesson.titleEn;
  const lContent =
    lang === "ES" && detail.lesson.contentEs ? detail.lesson.contentEs : detail.lesson.contentEn;
  const lTranscript =
    lang === "ES" && detail.lesson.videoTranscriptEs
      ? detail.lesson.videoTranscriptEs
      : detail.lesson.videoTranscriptEn;
  const lVideoUrl =
    lang === "ES" && detail.lesson.videoUrlEs ? detail.lesson.videoUrlEs : detail.lesson.videoUrl;
  // Once a lesson has a real Spanish-dubbed video, the written transcript is
  // redundant for Spanish trainees — it stays as a fallback only for lessons
  // that don't have a dub yet.
  const showTranscript = lTranscript && !(lang === "ES" && detail.lesson.videoUrlEs);

  const nextHref = inRookieSequence
    ? rookieNextHref
    : detail.isLast
      ? `/modules/${params.slug}/quiz`
      : `/modules/${params.slug}/lesson/${order + 1}`;
  const bypassGate = detail.moduleCompleted || detail.alreadyCompleted;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/modules/${params.slug}`}
          className="mb-3 inline-block text-sm text-brand-700 hover:underline"
        >
          {labels.backToModule}
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {labels.lessonWord} {order} {labels.ofWord} {detail.totalLessons}
          {detail.lesson.estimatedMinutes && <> · ~{detail.lesson.estimatedMinutes} min</>}
        </p>
        <h1 className="text-2xl font-semibold">{lTitle}</h1>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        {lVideoUrl && (
          <div className="mb-4">
            <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
              <iframe
                src={lVideoUrl}
                className="h-full w-full"
                allow="encrypted-media; fullscreen; microphone; screen-wake-lock;"
                allowFullScreen
                title={lTitle}
              />
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">
              Video not showing up?{" "}
              <a
                href={lVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                Open it directly in a new tab
              </a>
              .
            </p>
            {showTranscript && (
              <details className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-neutral-700">
                  {lang === "ES" ? "Transcripción del video" : "Video Transcript"}
                </summary>
                <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                  {lTranscript}
                </div>
              </details>
            )}
          </div>
        )}
        {detail.lesson.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={detail.lesson.imageUrl}
            alt=""
            className="mb-4 w-full rounded-md object-cover"
          />
        )}
        <LessonContent text={lContent} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {order > 1 && (
          <Link
            href={`/modules/${params.slug}/lesson/${order - 1}`}
            className="rounded-md border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {labels.previousLesson}
          </Link>
        )}
        <LessonContinueButton
          lessonId={detail.lesson.id}
          slug={params.slug}
          nextHref={nextHref}
          minWatchSeconds={lVideoUrl ? detail.lesson.videoDurationSeconds : null}
          bypassGate={bypassGate}
          label={!inRookieSequence && detail.isLast ? labels.goToQuiz : labels.continue}
          watchLabel={labels.watchToUnlock}
          countdownLabel={labels.continueAvailableIn}
        />
      </div>
    </div>
  );
}
