import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTrainingContentEditAccess } from "@/lib/trainingContentAccess";
import { getRookieDayContentSequence, getTrainingExperienceVersion, ROOKIE_DAY_COUNT } from "@/lib/rookieJourney";
import DayContentForm from "@/app/(portal)/admin/rookie-journey/[dayNumber]/DayContentForm";
import LessonEditor from "@/app/(portal)/admin/content/[slug]/LessonEditor";
import RookieContentCardTextEditor from "./RookieContentCardTextEditor";

// Mirrors the exact merge (same table, same order, same kind-tagging) the
// trainee-facing getTodaysRookieTraining/getRookieDayReview use, so a
// granted editor sees — and edits — the same content a trainee actually
// encounters, not a separately-derived view. A LESSON entry embeds the
// EXISTING, unmodified LessonEditor/updateLessonAction (text-only here —
// canAdminister is always false in this embedded context; publish/delete
// for a lesson still requires the real /admin/content editor). A CONTENT
// entry uses the new RookieContentCardTextEditor, sharing
// updateRookieContentItemAction with the real /admin/rookie-journey editor.
// Creating/deleting/reordering/assigning/re-kinding/field-skill/mode-switch
// are never exposed here, for anyone — those stay on /admin/rookie-journey.
export const dynamic = "force-dynamic";

export default async function TrainingContentEditorRookieDayPage({ params }: { params: { dayNumber: string } }) {
  const { isAdmin } = await requireTrainingContentEditAccess();
  const dayNumber = Number(params.dayNumber);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > ROOKIE_DAY_COUNT) notFound();

  // Curriculum-allowlist boundary: Rookie Day content is only the live
  // curriculum while Rookie Journey is the active mode. ADMIN is never
  // restricted by this; a non-admin editor hitting this route directly
  // while Classic is active is redirected, not shown stale/non-live content.
  if (!isAdmin && (await getTrainingExperienceVersion()) !== "rookie") {
    redirect("/training/content-editor");
  }

  const day = await prisma.rookieDay.findUnique({ where: { dayNumber } });
  if (!day) notFound();

  const sequence = await getRookieDayContentSequence(day.id);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/training/content-editor" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          ← Back to Training Content Editor
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Rookie Day {day.dayNumber}</p>
        <h1 className="text-2xl font-semibold">{day.titleEn}</h1>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">Day Details</h2>
        <DayContentForm
          day={{
            dayNumber: day.dayNumber,
            titleEn: day.titleEn,
            titleEs: day.titleEs,
            descriptionEn: day.descriptionEn,
            descriptionEs: day.descriptionEs,
            estimatedAcademyMinutes: day.estimatedAcademyMinutes,
            fieldGoalEn: day.fieldGoalEn,
            fieldGoalEs: day.fieldGoalEs,
            updatedAt: day.updatedAt.toISOString(),
          }}
          canAdminister={isAdmin}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Content — in trainee order</h2>
        <div className="space-y-4">
          {sequence.map((row) =>
            row.type === "LESSON" ? (
              <div key={`lesson-${row.data.id}`} className="rounded-md border border-neutral-200 p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Assigned lesson — Module {row.data.lesson.module.order}: {row.data.lesson.module.titleEn}
                </p>
                <LessonEditor
                  moduleId={row.data.lesson.moduleId}
                  slug={row.data.lesson.module.slug}
                  lessons={[{ ...row.data.lesson, updatedAt: row.data.lesson.updatedAt.toISOString() }]}
                  canAdminister={false}
                />
              </div>
            ) : (
              <div key={`content-${row.data.id}`}>
                <RookieContentCardTextEditor
                  item={{
                    ...row.data,
                    updatedAt: row.data.updatedAt.toISOString(),
                    sourceLessonIds: row.data.sourceLessons.map((sl) => sl.lessonId),
                  }}
                />
              </div>
            )
          )}
          {sequence.length === 0 && (
            <p className="text-sm text-neutral-400">No lessons or content cards assigned to this day yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
