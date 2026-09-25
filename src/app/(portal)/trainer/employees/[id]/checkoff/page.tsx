import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAssignedTraineeIds } from "@/lib/trainingAssignment";
import { getTodaysRookieTraining, getRookieFieldCheckoffHistory } from "@/lib/rookieJourney";
import CheckoffForm from "./CheckoffForm";

export default async function FieldCheckoffPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Same scoping rule as the rest of the Trainer portal — a Trainer can
  // only open a checkoff for a trainee assigned to them.
  if (session.role === "TRAINER") {
    const assignedIds = await getAssignedTraineeIds(session.sub);
    if (!assignedIds.includes(params.id)) notFound();
  }

  const trainee = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, role: true },
  });
  if (!trainee || trainee.role !== "TRAINEE") notFound();

  const [training, history] = await Promise.all([
    getTodaysRookieTraining(trainee.id),
    getRookieFieldCheckoffHistory(trainee.id),
  ]);

  const rookieDay = training.position.phase === "ROOKIE_DAY" ? training.position.day : null;

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-10">
      <div>
        <Link
          href={`/trainer/employees/${trainee.id}`}
          className="mb-3 inline-block text-sm text-brand-700 hover:underline"
        >
          ← Back to {trainee.name}
        </Link>
        <h1 className="text-2xl font-semibold">
          {rookieDay ? `Day ${rookieDay}` : "Field Checkoff"} — {trainee.name}
        </h1>
        {training.day && <p className="mt-1 text-sm text-neutral-500">{training.day.titleEn}</p>}
      </div>

      {!rookieDay || !training.day ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
          {trainee.name} is past the 10-day Rookie window, so there's no daily field focus to check off today. Field
          performance from here is tracked via Field Day Evaluations.
        </p>
      ) : (
        <CheckoffForm
          traineeId={trainee.id}
          rookieDayNumber={rookieDay}
          fieldSkills={training.day.fieldSkills}
          isEarlyPhase={rookieDay <= 3}
        />
      )}

      {history.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-neutral-900">Past Checkoffs</h2>
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <p className="mb-2 text-sm font-medium text-neutral-900">
                  Day {h.rookieDayNumber} — {new Date(h.checkoffDate).toLocaleDateString()} · {h.trainerName}
                </p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {h.ratings.map((r, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700"
                    >
                      {r.fieldSkillLabelEn}: {r.rating.replace(/_/g, " ").toLowerCase()}
                    </span>
                  ))}
                </div>
                {h.wentWellNotes && <p className="text-xs text-neutral-600">Went well: {h.wentWellNotes}</p>}
                {h.needsCoachingNotes && (
                  <p className="text-xs text-neutral-600">Needs coaching: {h.needsCoachingNotes}</p>
                )}
                {h.tomorrowFocusNotes && (
                  <p className="text-xs text-neutral-600">Tomorrow's focus: {h.tomorrowFocusNotes}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
