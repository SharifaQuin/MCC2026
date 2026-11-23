import Link from "next/link";
import { t } from "@/lib/i18n";
import type { SessionPayload } from "@/lib/session";
import { getTodaysRookieTraining, ROOKIE_DAY_COUNT } from "@/lib/rookieJourney";
import { getOnboardingDocumentsForUser } from "@/lib/onboarding";
import { getSignedDocumentsForUser } from "@/lib/documentTemplates";
import { getEmployeePayrollEntries } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { getChecklistTasksForRole } from "@/lib/financials";
import AssignedChecklist from "@/components/AssignedChecklist";
import { ChartIcon, BookIcon, DocsIcon, DollarIcon } from "@/components/icons";

// The compact "Home" card for a Trainee in the Rookie Journey experience —
// greeting, today's progress, and the same shortcut tiles the mobile
// bottom-nav's Home tab is meant to surface. The full rail + day-by-day
// detail this used to render lives at /rookie now (src/app/(portal)/rookie/
// page.tsx) — same getTodaysRookieTraining() call, same enrollment/unlock/
// completion rules either way, just split across two screens instead of
// one long one, matching the approved Home-vs-Training mockup split.
export default async function RookieJourneyHome({ session }: { session: SessionPayload }) {
  const labels = t(session.language);
  const isEs = session.language === "ES";
  const firstName = session.name.split(" ")[0];

  const [user, training, onboardingDocs, personnelDocs, payrollEntries, checklistTasks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.sub },
      select: { certificationStatus: true },
    }),
    getTodaysRookieTraining(session.sub),
    getOnboardingDocumentsForUser(session.sub),
    getSignedDocumentsForUser(session.sub),
    getEmployeePayrollEntries(session.sub),
    getChecklistTasksForRole(session.role, session.sub),
  ]);

  const checklistItems = checklistTasks.map((t) => ({
    id: t.id,
    task: t.task,
    effectiveStatus: t.effectiveStatus,
    notes: t.notes,
    targetDate: t.targetDate ? t.targetDate.toISOString() : null,
    dueFridayOfWeek: t.dueFridayOfWeek,
    frequency: t.frequency,
  }));

  const pendingDocsCount =
    onboardingDocs.filter((d) => !d.signedAt).length + personnelDocs.filter((d) => !d.signedAt).length;
  const pendingPayroll = payrollEntries.find((p) => p.status === "PENDING");

  const { position, day } = training;
  const daysComplete = position.phase === "ROOKIE_DAY" ? position.day - 1 : ROOKIE_DAY_COUNT;
  const progressPct = Math.min(100, (daysComplete / ROOKIE_DAY_COUNT) * 100);

  const firstIncomplete = day?.sequence.find((e) => !e.completed) ?? null;
  const anyCompleted = day?.sequence.some((e) => e.completed) ?? false;
  const primaryHref = firstIncomplete
    ? firstIncomplete.kind === "LESSON"
      ? `/modules/${firstIncomplete.moduleSlug}/lesson/${firstIncomplete.lessonOrder}`
      : `/rookie/content/${firstIncomplete.id}`
    : null;
  const primaryLabel = anyCompleted ? labels.rookieContinueDay : labels.rookieStartDay;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">
        {labels.welcome}, {firstName}!
      </h1>
      <p className="mb-6 text-sm text-neutral-500">
        {new Date().toLocaleDateString(isEs ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric" })}
      </p>

      <div className="space-y-4">
        {position.phase === "ROOKIE_DAY" && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-600">
              {labels.rookieJourneyTitle}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-neutral-900">
              {isEs
                ? `${labels.dayWord} ${position.day} de ${ROOKIE_DAY_COUNT}, ¡sigue así!`
                : `${labels.dayWord} ${position.day} of ${ROOKIE_DAY_COUNT}, keep going!`}
            </h2>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {isEs ? `${daysComplete} días completados` : `${daysComplete} days complete`}
            </p>

            {day && day.sequence.length > 0 && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {labels.todaysTraining}
                </p>
                <ul className="space-y-1.5">
                  {day.sequence.map((entry) => {
                    const entryTitle = isEs && entry.titleEs ? entry.titleEs : entry.titleEn;
                    return (
                      <li key={`${entry.kind}-${entry.id}`} className="flex items-center gap-2 text-sm">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            entry.completed ? "bg-green-500" : "border-2 border-neutral-300"
                          }`}
                        />
                        <span className={entry.completed ? "text-neutral-500 line-through" : "text-neutral-800"}>
                          {entryTitle}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {day && !(day.allLessonsComplete && day.sequence.length > 0) && primaryHref && (
              <Link
                href={primaryHref}
                className="mt-4 inline-block rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                {primaryLabel}
              </Link>
            )}

            <Link href="/rookie" className="mt-3 block text-sm font-medium text-brand-700 hover:underline">
              {labels.rookieJourneyTitle} →
            </Link>
          </section>
        )}

        {user?.certificationStatus === "CERTIFIED" && (
          <div className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 p-4">
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
            className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:border-amber-300"
          >
            <p className="font-medium text-amber-800">
              {isEs
                ? `Tienes ${pendingDocsCount} documento(s) por firmar`
                : `You have ${pendingDocsCount} document${pendingDocsCount === 1 ? "" : "s"} to sign`}
            </p>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              {isEs ? "Firmar →" : "Sign Now →"}
            </span>
          </Link>
        )}

        {pendingPayroll && (
          <Link
            href={`/payroll/${pendingPayroll.id}`}
            className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:border-amber-300"
          >
            <p className="font-medium text-amber-800">{pendingPayroll.payPeriodLabel}</p>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">→</span>
          </Link>
        )}

        {checklistItems.length > 0 && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-2 text-lg font-medium text-neutral-900">{isEs ? "Tus Tareas" : "Your Tasks"}</h2>
            <AssignedChecklist tasks={checklistItems} canEdit={true} />
          </section>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Link href="/progress" className="rounded-2xl border border-neutral-200 bg-white p-4 hover:border-brand-300">
            <ChartIcon className="h-5 w-5 text-brand-600" />
            <p className="mt-2 text-sm font-semibold text-neutral-900">{labels.progress}</p>
            <p className="text-xs text-neutral-500">{isEs ? "Estrellas y logros" : "Stars & milestones"}</p>
          </Link>
          <Link href="/glossary" className="rounded-2xl border border-neutral-200 bg-white p-4 hover:border-brand-300">
            <BookIcon className="h-5 w-5 text-brand-600" />
            <p className="mt-2 text-sm font-semibold text-neutral-900">{labels.glossary}</p>
            <p className="text-xs text-neutral-500">{isEs ? "Términos y frases" : "Terms & phrases"}</p>
          </Link>
          <Link href="/documents" className="rounded-2xl border border-neutral-200 bg-white p-4 hover:border-brand-300">
            <DocsIcon className="h-5 w-5 text-brand-600" />
            <p className="mt-2 text-sm font-semibold text-neutral-900">{labels.documents}</p>
            <p className="text-xs text-neutral-500">{isEs ? "Firmar y revisar" : "Sign & review"}</p>
          </Link>
          <Link href="/payroll" className="rounded-2xl border border-neutral-200 bg-white p-4 hover:border-brand-300">
            <DollarIcon className="h-5 w-5 text-brand-600" />
            <p className="mt-2 text-sm font-semibold text-neutral-900">{labels.payroll}</p>
            <p className="text-xs text-neutral-500">{isEs ? "Tus registros de pago" : "Your pay records"}</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
