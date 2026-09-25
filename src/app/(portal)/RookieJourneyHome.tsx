import Link from "next/link";
import { t } from "@/lib/i18n";
import type { SessionPayload } from "@/lib/session";
import { getTodaysRookieTraining, type RookieRailStop } from "@/lib/rookieJourney";
import { getOnboardingDocumentsForUser } from "@/lib/onboarding";
import { getSignedDocumentsForUser } from "@/lib/documentTemplates";
import { getEmployeePayrollEntries } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

function RailDot({ stop }: { stop: RookieRailStop }) {
  const isMilestone = Number(stop.label) > 10;
  const base = "flex h-9 min-w-9 items-center justify-center rounded-full px-1 text-xs font-semibold";
  const style =
    stop.status === "current"
      ? "bg-brand-600 text-white ring-4 ring-brand-100"
      : stop.status === "done"
        ? "bg-green-100 text-green-800"
        : "bg-neutral-100 text-neutral-400";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${base} ${style}`}>{isMilestone ? `★${stop.label}` : stop.label}</div>
    </div>
  );
}

export default async function RookieJourneyHome({ session }: { session: SessionPayload }) {
  const labels = t(session.language);
  const isEs = session.language === "ES";
  const firstName = session.name.split(" ")[0];

  const [user, training, onboardingDocs, personnelDocs, payrollEntries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.sub },
      select: { certificationStatus: true },
    }),
    getTodaysRookieTraining(session.sub),
    getOnboardingDocumentsForUser(session.sub),
    getSignedDocumentsForUser(session.sub),
    getEmployeePayrollEntries(session.sub),
  ]);

  const pendingDocsCount =
    onboardingDocs.filter((d) => !d.signedAt).length + personnelDocs.filter((d) => !d.signedAt).length;
  const pendingPayroll = payrollEntries.find((p) => p.status === "PENDING");

  const { position, rail, day } = training;

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
      <h1 className="mb-1 text-2xl font-semibold">
        {labels.welcome}, {firstName}!
      </h1>
      {position.phase === "ROOKIE_DAY" ? (
        <p className="mb-4 text-sm text-neutral-600">
          {labels.rookieOnDayOf} <span className="font-semibold text-neutral-900">{position.day}</span>{" "}
          {labels.rookieOfRookieTraining}
        </p>
      ) : (
        <p className="mb-4 text-sm text-neutral-600">{labels.rookieTrainingComplete}</p>
      )}

      {/* Progress rail — Day 1..10, then 30/60/90 milestones */}
      <div className="mb-6 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-2">
        {rail.map((stop, i) => (
          <div key={stop.key} className="flex items-center gap-1.5">
            <RailDot stop={stop} />
            {i < rail.length - 1 && <div className="h-0.5 w-3 shrink-0 bg-neutral-200" />}
          </div>
        ))}
      </div>

      {milestoneLine && (
        <div className="mb-6 rounded-lg border border-gold-200 bg-gold-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gold-700">{labels.nextMilestone}</p>
          <p className="font-medium text-neutral-900">{milestoneLine}</p>
        </div>
      )}

      {user?.certificationStatus === "CERTIFIED" && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">{labels.certifiedBanner}</p>
          <Link
            href={`/certificate/${session.sub}`}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            {labels.viewMyCertificate}
          </Link>
        </div>
      )}

      {pendingDocsCount > 0 && (
        <Link
          href="/documents"
          className="mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 hover:border-amber-300"
        >
          <p className="font-medium text-amber-800">
            {isEs
              ? `Tienes ${pendingDocsCount} documento(s) por firmar`
              : `You have ${pendingDocsCount} document${pendingDocsCount === 1 ? "" : "s"} to sign`}
          </p>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">→</span>
        </Link>
      )}

      {pendingPayroll && (
        <Link
          href={`/payroll/${pendingPayroll.id}`}
          className="mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 hover:border-amber-300"
        >
          <p className="font-medium text-amber-800">{pendingPayroll.payPeriodLabel}</p>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">→</span>
        </Link>
      )}

      {day && (
        <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-neutral-900">
              {labels.dayWord} {day.dayNumber} — {isEs ? day.titleEs : day.titleEn}
            </h2>
          </div>
          <p className="mb-4 text-sm text-neutral-600">{isEs ? day.descriptionEs : day.descriptionEn}</p>

          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {labels.todaysTraining}
          </h3>
          {day.lessons.length === 0 ? (
            <p className="mb-4 text-sm text-neutral-400">
              {isEs ? "Nada asignado para hoy todavía." : "Nothing assigned for today yet."}
            </p>
          ) : (
            <ul className="mb-4 space-y-2">
              {day.lessons.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/modules/${l.moduleSlug}/lesson/${l.lessonOrder}`}
                    className="flex items-center justify-between rounded-md border border-neutral-200 p-3 hover:border-brand-300"
                  >
                    <span className="text-sm font-medium text-neutral-900">
                      {isEs && l.titleEs ? l.titleEs : l.titleEn}
                    </span>
                    {l.completed ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        {labels.lessonCompleteBadge}
                      </span>
                    ) : (
                      <span className="text-xs text-brand-700">{labels.continue} →</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {day.allLessonsComplete && day.lessons.length > 0 && (
            <p className="mb-4 text-sm font-medium text-green-700">{labels.todaysTrainingAllDone}</p>
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

      <Link
        href="/modules"
        className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-5 hover:border-brand-300"
      >
        <div>
          <p className="font-medium text-neutral-900">{labels.knowledgeLibrary}</p>
          <p className="mt-0.5 text-sm text-neutral-500">{labels.knowledgeLibrarySubtitle}</p>
        </div>
        <span className="text-brand-700">→</span>
      </Link>

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
