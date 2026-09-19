import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import type { SessionPayload } from "@/lib/session";
import { getModuleListForUser } from "@/lib/courses";
import { loadFieldEvaluationSummaryForTrainee } from "@/lib/fieldEvalData";
import { getOnboardingDocumentsForUser } from "@/lib/onboarding";
import { getSignedDocumentsForUser } from "@/lib/documentTemplates";
import { getEmployeePayrollEntries } from "@/lib/payroll";
import { getOnboardingPace } from "@/lib/onboardingPace";

// The real "home" for a Trainee — reached once onboarding paperwork is
// signed (requireOnboardingComplete/HomePage still redirects to /documents
// before this). Previously a Trainee never saw a landing page at all —
// they went straight to /modules — so this just surfaces a summary of
// what's already tracked across Modules/Progress/Documents/Payroll rather
// than adding any new data.
export default async function TraineeHome({ session }: { session: SessionPayload }) {
  const labels = t(session.language);

  const [user, modules, fieldEvals, onboardingDocs, personnelDocs, payrollEntries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.sub },
      select: { createdAt: true, active: true, mustSetPassword: true, certificationStatus: true },
    }),
    getModuleListForUser(session.sub),
    loadFieldEvaluationSummaryForTrainee(session.sub),
    getOnboardingDocumentsForUser(session.sub),
    getSignedDocumentsForUser(session.sub),
    getEmployeePayrollEntries(session.sub),
  ]);

  const totalModules = modules.length;
  const completedModules = modules.filter((m) => m.status === "COMPLETED").length;
  const nextModule = modules.find((m) => !m.locked && m.status !== "COMPLETED");

  const pace = user
    ? getOnboardingPace({
        createdAt: user.createdAt,
        active: user.active,
        mustSetPassword: user.mustSetPassword,
        certified: user.certificationStatus === "CERTIFIED",
      })
    : null;

  const pendingDocsCount =
    onboardingDocs.filter((d) => !d.signedAt).length + personnelDocs.filter((d) => !d.signedAt).length;
  const latestFieldEval = fieldEvals[0] ?? null;
  const pendingPayroll = payrollEntries.find((p) => p.status === "PENDING");

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">
        {labels.welcome}, {session.name}!
      </h1>
      <p className="mb-6 text-sm text-neutral-500">Here's where things stand.</p>

      <div className="space-y-6">
        {pace && (
          <div
            className={`rounded-lg border p-4 ${
              pace.overdue ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"
            }`}
          >
            <p className={`font-medium ${pace.overdue ? "text-red-800" : "text-blue-800"}`}>
              {pace.overdue
                ? `Day ${pace.day} — past the 3-day onboarding goal`
                : `Day ${pace.day} of 3 — welcome to onboarding!`}
            </p>
          </div>
        )}

        {user?.certificationStatus === "CERTIFIED" && (
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
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
            className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 hover:border-amber-300"
          >
            <p className="font-medium text-amber-800">
              You have {pendingDocsCount} document{pendingDocsCount === 1 ? "" : "s"} to sign
            </p>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              Sign Now →
            </span>
          </Link>
        )}

        {pendingPayroll && (
          <Link
            href={`/payroll/${pendingPayroll.id}`}
            className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 hover:border-amber-300"
          >
            <p className="font-medium text-amber-800">{pendingPayroll.payPeriodLabel} needs your review</p>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              Review →
            </span>
          </Link>
        )}

        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-900">{labels.modules}</h2>
            {nextModule && (
              <Link
                href={`/modules/${nextModule.slug}`}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                {labels.continueTraining}
              </Link>
            )}
          </div>
          <p className="text-sm text-neutral-500">
            {completedModules} of {totalModules} modules completed
          </p>
          {totalModules > 0 && completedModules === totalModules && (
            <p className="mt-2 text-sm font-medium text-green-700">{labels.allModulesComplete}</p>
          )}
          <Link href="/modules" className="mt-3 inline-block text-sm text-brand-700 hover:underline">
            View all modules →
          </Link>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-2 text-lg font-medium text-neutral-900">{labels.fieldEvaluations}</h2>
          {latestFieldEval ? (
            <p className="text-sm text-neutral-700">
              Most recent — {new Date(latestFieldEval.fieldDate).toLocaleDateString()}: {labels.overallScore}{" "}
              {latestFieldEval.overallScore}/5
            </p>
          ) : (
            <p className="text-sm text-neutral-500">{labels.noFieldEvals}</p>
          )}
          <Link href="/progress" className="mt-3 inline-block text-sm text-brand-700 hover:underline">
            View full progress →
          </Link>
        </section>

        <p className="text-sm text-neutral-500">
          Need a quick refresher on a term?{" "}
          <Link href="/glossary" className="text-brand-700 hover:underline">
            {labels.glossary}
          </Link>
        </p>
      </div>
    </div>
  );
}
