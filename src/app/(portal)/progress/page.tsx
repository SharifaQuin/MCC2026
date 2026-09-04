import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { loadFieldEvaluationSummaryForTrainee } from "@/lib/fieldEvalData";

export default async function ProgressPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const labels = t(session.language);

  const modules = await prisma.module.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    include: {
      progress: { where: { userId: session.sub } },
      quizAttempts: { where: { userId: session.sub }, orderBy: { createdAt: "desc" } },
    },
  });

  const fieldEvals = await loadFieldEvaluationSummaryForTrainee(session.sub);

  const total = modules.length;
  const completed = modules.filter((m) => m.progress[0]?.status === "COMPLETED").length;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{labels.progress}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {completed} / {total} modules completed
      </p>

      <div className="space-y-3">
        {modules.map((m) => {
          const title = session.language === "ES" && m.titleEs ? m.titleEs : m.titleEn;
          const status = m.progress[0]?.status ?? "NOT_STARTED";
          const bestAttempt = m.quizAttempts.reduce<number | null>(
            (best, a) => (best === null || a.scorePct > best ? a.scorePct : best),
            null
          );

          return (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-xs text-neutral-500">
                  {m.quizAttempts.length} attempt{m.quizAttempts.length === 1 ? "" : "s"}
                  {bestAttempt !== null ? ` · best score ${bestAttempt}%` : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  status === "COMPLETED"
                    ? "bg-green-100 text-green-700"
                    : status === "IN_PROGRESS"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {status === "COMPLETED"
                  ? labels.completed
                  : status === "IN_PROGRESS"
                    ? labels.inProgress
                    : labels.notStarted}
              </span>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-10 text-xl font-semibold">{labels.fieldEvaluations}</h2>
      {fieldEvals.length === 0 ? (
        <p className="text-sm text-neutral-500">{labels.noFieldEvals}</p>
      ) : (
        <div className="space-y-2">
          {fieldEvals.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
            >
              <p className="text-sm">{new Date(ev.fieldDate).toLocaleDateString()}</p>
              <p className="text-sm font-medium">
                {labels.overallScore}: {ev.overallScore}/5
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
