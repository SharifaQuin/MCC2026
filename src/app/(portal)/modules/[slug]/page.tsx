import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getModuleOverview, markModuleInProgress } from "@/lib/courses";
import { t } from "@/lib/i18n";

export default async function ModuleOverviewPage({ params }: { params: { slug: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const labels = t(session.language);

  const overview = await getModuleOverview(params.slug, session.sub);
  if (!overview) notFound();
  if (overview.locked) redirect("/modules");

  await markModuleInProgress(session.sub, overview.module.id);

  const lang = session.language;
  const title =
    lang === "ES" && overview.module.titleEs ? overview.module.titleEs : overview.module.titleEn;
  const lessons = overview.module.lessons;

  const continueHref =
    overview.status === "COMPLETED"
      ? `/modules/${params.slug}/lesson/1`
      : `/modules/${params.slug}/lesson/${overview.firstIncompleteOrder}`;
  const continueLabel =
    overview.status === "NOT_STARTED"
      ? labels.startModule
      : overview.status === "COMPLETED"
        ? labels.reviewModule
        : labels.continue;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/modules" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          {labels.backToModules}
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Module {overview.module.order}
        </p>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <ol className="space-y-2">
          {lessons.map((lesson, i) => {
            const lTitle = lang === "ES" && lesson.titleEs ? lesson.titleEs : lesson.titleEn;
            const isCompleted =
              overview.status === "COMPLETED" || overview.completedLessonIds.has(lesson.id);
            const isReachable =
              overview.status === "COMPLETED" ||
              isCompleted ||
              lesson.order === overview.firstIncompleteOrder;
            const badge = (
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  isCompleted ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {isCompleted ? "✓" : i + 1}
              </span>
            );
            return (
              <li key={lesson.id} className="flex items-center gap-3 text-sm">
                {badge}
                {isReachable ? (
                  <Link
                    href={`/modules/${params.slug}/lesson/${lesson.order}`}
                    className={`hover:underline ${
                      isCompleted ? "text-neutral-600" : "font-medium text-brand-700"
                    }`}
                  >
                    {lTitle}
                  </Link>
                ) : (
                  <span className="text-neutral-400">{lTitle}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={continueHref}
          className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {continueLabel}
        </Link>
        {overview.allLessonsCompleted && (
          <Link
            href={`/modules/${params.slug}/quiz`}
            className="rounded-md border border-brand-600 px-5 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {labels.goToQuiz}
          </Link>
        )}
      </div>
    </div>
  );
}
