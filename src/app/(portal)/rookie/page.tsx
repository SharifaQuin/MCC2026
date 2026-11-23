import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getTodaysRookieTraining, getTrainingExperienceVersion, type RookieRailStop } from "@/lib/rookieJourney";
import { requireOnboardingComplete } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

function RailDot({ stop }: { stop: RookieRailStop }) {
  const isMilestone = Number(stop.label) > 10;
  const isReviewableDay = !isMilestone && stop.status === "done";
  const base = "flex h-9 min-w-9 items-center justify-center rounded-full px-1 text-xs font-semibold";
  const style =
    stop.status === "current"
      ? "bg-brand-600 text-white ring-4 ring-brand-100"
      : stop.status === "done"
        ? "bg-green-100 text-green-800"
        : "bg-neutral-100 text-neutral-400";
  const dot = <div className={`${base} ${style}`}>{isMilestone ? `★${stop.label}` : stop.label}</div>;
  return (
    <div className="flex flex-col items-center gap-1">
      {isReviewableDay ? <Link href={`/rookie/day/${stop.label}`}>{dot}</Link> : dot}
    </div>
  );
}

// The "Training" tab destination for a Trainee still in the Rookie Journey
// experience (see BottomNav/layout.tsx) — the full rail + today's detail
// that used to be the entire Home page body. Reuses the exact same
// getTodaysRookieTraining() data RookieJourneyHome (now the compact Home
// card) and /rookie/day/[dayNumber] already read; no new training logic.
export default async function RookieJourneyPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "TRAINEE") redirect("/");
  // Same gate every other training-facing page (modules, lessons, quiz,
  // /rookie/day/[dayNumber]) already applies — a no-op once nothing's
  // unsigned, a redirect to /documents otherwise. Lesson-level access
  // (getRookieLessonAccess/getRookieContentAccess) is unaffected and still
  // runs separately wherever this page links into actual lesson content.
  await requireOnboardingComplete(session);
  const trainingVersion = await getTrainingExperienceVersion();
  if (trainingVersion === "classic") redirect("/modules");

  const labels = t(session.language);
  const isEs = session.language === "ES";

  const [user, training] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.sub }, select: { certificationStatus: true } }),
    getTodaysRookieTraining(session.sub),
  ]);

  const { position, rail, day } = training;

  const firstIncomplete = day?.sequence.find((e) => !e.completed) ?? null;
  const anyCompleted = day?.sequence.some((e) => e.completed) ?? false;
  const primaryHref = firstIncomplete
    ? firstIncomplete.kind === "LESSON"
      ? `/modules/${firstIncomplete.moduleSlug}/lesson/${firstIncomplete.lessonOrder}`
      : `/rookie/content/${firstIncomplete.id}`
    : null;
  const primaryLabel = anyCompleted ? labels.rookieContinueDay : labels.rookieStartDay;

  const milestoneLine =
    position.phase === "AWAITING_30"
      ? labels.sealOfApproval30
      : position.phase === "AWAITING_60"
        ? labels.day60Review
        : position.phase === "AWAITING_90"
          ? labels.day90Review
          : null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">{labels.rookieJourneyTitle}</h1>
      {position.phase === "ROOKIE_DAY" ? (
        <p className="mb-4 text-sm text-neutral-600">
          {labels.rookieOnDayOf} <span className="font-semibold text-neutral-900">{position.day}</span>{" "}
          {labels.rookieOfRookieTraining}
        </p>
      ) : (
        <p className="mb-4 text-sm text-neutral-600">{labels.rookieTrainingComplete}</p>
      )}

      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {isEs ? "Días de entrenamiento" : "Training Days"}
        </p>
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-2">
          {rail.map((stop, i) => (
            <div key={stop.key} className="flex items-center gap-1.5">
              <RailDot stop={stop} />
              {i < rail.length - 1 && <div className="h-0.5 w-3 shrink-0 bg-neutral-200" />}
            </div>
          ))}
        </div>
      </section>

      {milestoneLine && (
        <div className="mb-6 rounded-2xl border border-gold-200 bg-gold-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gold-700">{labels.nextMilestone}</p>
          <p className="font-medium text-neutral-900">{milestoneLine}</p>
        </div>
      )}

      {user?.certificationStatus === "CERTIFIED" && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">{labels.certifiedBanner}</p>
          <Link
            href={`/certificate/${session.sub}`}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            {labels.viewMyCertificate}
          </Link>
        </div>
      )}

      {day && (
        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-neutral-900">
              {labels.dayWord} {day.dayNumber} — {isEs ? day.titleEs : day.titleEn}
            </h2>
          </div>
          <p className="mb-4 text-sm text-neutral-600">{isEs ? day.descriptionEs : day.descriptionEn}</p>

          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {labels.todaysTraining}
          </h3>
          {day.sequence.length === 0 ? (
            <p className="mb-4 text-sm text-neutral-400">
              {isEs ? "Nada asignado para hoy todavía." : "Nothing assigned for today yet."}
            </p>
          ) : (
            <ul className="mb-4 space-y-1.5">
              {day.sequence.map((entry) => {
                const entryTitle = isEs && entry.titleEs ? entry.titleEs : entry.titleEn;
                const href =
                  entry.kind === "LESSON"
                    ? `/modules/${entry.moduleSlug}/lesson/${entry.lessonOrder}`
                    : `/rookie/content/${entry.id}`;
                return (
                  <li key={`${entry.kind}-${entry.id}`}>
                    <Link
                      href={href}
                      className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2 hover:border-brand-300"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                          entry.completed
                            ? "bg-green-100 text-green-700"
                            : "border border-neutral-300 text-neutral-400"
                        }`}
                      >
                        {entry.completed ? "✓" : ""}
                      </span>
                      <span className="text-sm font-medium text-neutral-900">{entryTitle}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {day.allLessonsComplete && day.sequence.length > 0 ? (
            <p className="mb-4 text-sm font-medium text-green-700">{labels.todaysTrainingAllDone}</p>
          ) : (
            primaryHref && (
              <Link
                href={primaryHref}
                className="mb-4 inline-block rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                {primaryLabel}
              </Link>
            )
          )}

          <p className="mb-3 text-xs text-neutral-500">
            {labels.estimatedAcademyTimeToday}: {day.estimatedAcademyMinutes} {labels.minutesWord}
          </p>

          {day.fieldSkills.length > 0 && (
            <div className="mb-3">
              <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {labels.todaysFieldFocus}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {day.fieldSkills.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
                  >
                    {isEs ? s.labelEs : s.labelEn}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(day.fieldGoalEn || day.fieldGoalEs) && (
            <p className="text-sm text-neutral-600">
              <span className="font-medium">{labels.rookieFieldGoalLabel}:</span>{" "}
              {isEs ? day.fieldGoalEs : day.fieldGoalEn}
            </p>
          )}
        </section>
      )}

      <p className="mt-4 text-sm text-neutral-500">
        <Link href="/progress" className="text-brand-700 hover:underline">
          {labels.progress}
        </Link>
        {" · "}
        <Link href="/glossary" className="text-brand-700 hover:underline">
          {labels.glossary}
        </Link>
      </p>
    </div>
  );
}
