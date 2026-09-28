import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getRookieDayReview, getTrainingExperienceVersion } from "@/lib/rookieJourney";
import { getAssignedTraineeIds } from "@/lib/trainingAssignment";
import { requireOnboardingComplete } from "@/lib/onboarding";
import { t } from "@/lib/i18n";

export default async function RookieDayReviewPage({
  params,
  searchParams,
}: {
  params: { dayNumber: string };
  searchParams: { traineeId?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  await requireOnboardingComplete(session);
  const labels = t(session.language);

  const dayNumber = parseInt(params.dayNumber, 10);
  if (!Number.isFinite(dayNumber)) notFound();

  const isStaffViewer =
    session.role === "TRAINER" || session.role === "ADMIN" || session.role === "SERVICE_MANAGER";

  let targetUserId: string;
  let selfView: boolean;

  if (isStaffViewer) {
    if (!searchParams.traineeId) notFound();
    if (session.role === "TRAINER") {
      const assignedIds = await getAssignedTraineeIds(session.sub);
      if (!assignedIds.includes(searchParams.traineeId)) notFound();
    }
    targetUserId = searchParams.traineeId;
    selfView = false;
  } else {
    // A classic-mode trainee has no Rookie Day sequence to revisit.
    if ((await getTrainingExperienceVersion()) !== "rookie") redirect("/");
    targetUserId = session.sub;
    selfView = true;
  }

  const review = await getRookieDayReview(targetUserId, dayNumber);
  if (!review) notFound();

  const lang = session.language;
  const title = lang === "ES" ? review.titleEs : review.titleEn;
  const description = lang === "ES" ? review.descriptionEs : review.descriptionEn;
  const fieldGoal = lang === "ES" ? review.fieldGoalEs : review.fieldGoalEn;

  const backHref = selfView
    ? "/"
    : session.role === "TRAINER"
      ? `/trainer/employees/${targetUserId}`
      : `/admin/employees/${targetUserId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          {selfView ? labels.rookieBackToJourney : "← Back"}
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {labels.rookieDayHistoryTitle} · {labels.dayWord} {review.dayNumber}
          {review.isCurrentDay && ` · ${lang === "ES" ? "Hoy" : "Today"}`}
        </p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-600">{description}</p>}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <ul className="divide-y divide-neutral-100">
          {review.sequence.map((entry) => {
            const entryTitle = (lang === "ES" && entry.titleEs) || entry.titleEn;
            const href =
              entry.kind === "LESSON"
                ? `/modules/${entry.moduleSlug}/lesson/${entry.lessonOrder}`
                : `/rookie/content/${entry.id}`;
            return (
              <li key={`${entry.kind}-${entry.id}`} className="flex items-center gap-3 py-2.5 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                    entry.completed ? "bg-brand-600 text-white" : "border border-neutral-300 text-neutral-400"
                  }`}
                >
                  {entry.completed ? "✓" : ""}
                </span>
                {selfView ? (
                  <Link href={href} className="text-brand-700 hover:underline">
                    {entryTitle}
                  </Link>
                ) : (
                  <span className="text-neutral-700">{entryTitle}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {(fieldGoal || review.fieldSkills.length > 0) && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-sm">
          {fieldGoal && (
            <p className="mb-2">
              <span className="font-medium">{labels.rookieFieldGoalLabel}: </span>
              {fieldGoal}
            </p>
          )}
          {review.fieldSkills.length > 0 && (
            <ul className="list-inside list-disc text-neutral-700">
              {review.fieldSkills.map((s) => (
                <li key={s.id}>{lang === "ES" ? s.labelEs : s.labelEn}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
