import { prisma } from "@/lib/prisma";
import { loadFieldEvaluationsForTrainee } from "@/lib/fieldEvalData";
import FieldEvaluationHistory from "@/components/FieldEvaluationHistory";
import FieldEvaluationForm from "@/components/FieldEvaluationForm";

export async function loadEmployeeDetail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const modules = await prisma.module.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    include: {
      progress: { where: { userId } },
      quizAttempts: { where: { userId }, orderBy: { createdAt: "desc" } },
    },
  });

  const fieldEval = await loadFieldEvaluationsForTrainee(userId);

  return { user, modules, fieldEval };
}

type Detail = NonNullable<Awaited<ReturnType<typeof loadEmployeeDetail>>>;

export function EmployeeDetailView({ data }: { data: Detail }) {
  const { user, modules, fieldEval } = data;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <p className="text-sm text-neutral-500">{user.email}</p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">Training Module Progress</h2>
        <div className="space-y-3">
          {modules.map((m) => {
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
                  <p className="font-medium">{m.titleEn}</p>
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
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Field Day Evaluations</h2>
          <FieldEvaluationForm traineeId={user.id} />
        </div>
        <FieldEvaluationHistory
          evaluations={fieldEval.evaluations}
          categoryAverages={fieldEval.categoryAverages}
          focusAreas={fieldEval.focusAreas}
        />
      </section>
    </div>
  );
}
