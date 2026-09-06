import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getLessonDetail, markModuleInProgress } from "@/lib/courses";
import { t } from "@/lib/i18n";
import LessonContinueButton from "./LessonContinueButton";

export default async function LessonPage({
  params,
}: {
  params: { slug: string; order: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const labels = t(session.language);

  const order = parseInt(params.order, 10);
  if (!Number.isFinite(order) || order < 1) notFound();

  const detail = await getLessonDetail(params.slug, order, session.sub);
  if (!detail) notFound();
  if (detail.locked) redirect("/modules");
  if (detail.priorIncomplete) {
    redirect(`/modules/${params.slug}/lesson/${detail.firstIncompleteOrder}`);
  }

  await markModuleInProgress(session.sub, detail.module.id);

  const lang = session.language;
  const lTitle =
    lang === "ES" && detail.lesson.titleEs ? detail.lesson.titleEs : detail.lesson.titleEn;
  const lContent =
    lang === "ES" && detail.lesson.contentEs ? detail.lesson.contentEs : detail.lesson.contentEn;

  const nextHref = detail.isLast
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
        </p>
        <h1 className="text-2xl font-semibold">{lTitle}</h1>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        {detail.lesson.videoUrl && (
          <div className="mb-4 aspect-video w-full overflow-hidden rounded-md bg-black">
            <iframe
              src={detail.lesson.videoUrl}
              className="h-full w-full"
              allow="encrypted-media; fullscreen; microphone; screen-wake-lock;"
              allowFullScreen
              title={lTitle}
            />
          </div>
        )}
        <p className="whitespace-pre-line text-sm text-neutral-700">{lContent}</p>
      </div>

      <LessonContinueButton
        lessonId={detail.lesson.id}
        slug={params.slug}
        nextHref={nextHref}
        minWatchSeconds={detail.lesson.videoUrl ? detail.lesson.videoDurationSeconds : null}
        bypassGate={bypassGate}
        label={labels.continue}
        watchLabel={labels.watchToUnlock}
        countdownLabel={labels.continueAvailableIn}
      />
    </div>
  );
}
