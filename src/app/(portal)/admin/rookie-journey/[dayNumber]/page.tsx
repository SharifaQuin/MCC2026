import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllRookieDaysForAdmin, getFieldSkillLibrary, getLessonAssignmentOptions } from "@/lib/rookieJourney";
import DayContentForm from "./DayContentForm";
import AssignedLessonsList from "./AssignedLessonsList";
import FieldSkillPicker from "./FieldSkillPicker";
import RookieContentItemsPanel from "./RookieContentItemsPanel";

export default async function RookieDayAdminPage({ params }: { params: { dayNumber: string } }) {
  const dayNumber = Number(params.dayNumber);
  const [days, fieldSkillLibrary, lessonOptions] = await Promise.all([
    getAllRookieDaysForAdmin(),
    getFieldSkillLibrary(),
    getLessonAssignmentOptions(),
  ]);
  const day = days.find((d) => d.dayNumber === dayNumber);
  if (!day) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/rookie-journey" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          ← Back to Rookie Journey
        </Link>
        <h1 className="text-2xl font-semibold">
          Day {day.dayNumber} — {day.titleEn}
        </h1>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Content</h2>
        <DayContentForm day={day} />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-medium text-neutral-900">Assigned Lessons</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Reorder or remove lessons already assigned to this day. To assign more,{" "}
          <Link href="/admin/rookie-journey/lessons" className="text-brand-700 hover:underline">
            go to Assign Lessons
          </Link>
          .
        </p>
        <AssignedLessonsList
          lessons={day.lessons.map((l) => ({
            assignmentId: l.id,
            lessonId: l.lesson.id,
            lessonTitleEn: l.lesson.titleEn,
            moduleTitleEn: l.lesson.module.titleEn,
          }))}
        />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-medium text-neutral-900">Condensed Content Cards</h2>
        <p className="mb-3 text-sm text-neutral-500">
          New practical lessons, scenario cards, or recap cards — these never replace or duplicate the original
          lessons above, they just condense them for the Rookie Journey. Cards always show after the assigned
          lessons on this day.
        </p>
        <RookieContentItemsPanel
          dayNumber={day.dayNumber}
          lessons={lessonOptions.map((l) => ({ id: l.id, titleEn: l.titleEn, moduleTitleEn: l.moduleTitleEn }))}
          items={day.contentItems.map((c) => ({
            id: c.id,
            kind: c.kind,
            titleEn: c.titleEn,
            titleEs: c.titleEs,
            bodyEn: c.bodyEn,
            bodyEs: c.bodyEs,
            promptEn: c.promptEn,
            promptEs: c.promptEs,
            revealEn: c.revealEn,
            revealEs: c.revealEs,
            hasFutureVideoSlot: c.hasFutureVideoSlot,
            estimatedMinutes: c.estimatedMinutes,
            sourceLessonIds: c.sourceLessons.map((sl) => sl.lessonId),
            sourceLessonLabels: c.sourceLessons.map((sl) => `${sl.lesson.module.titleEn} — ${sl.lesson.titleEn}`),
          }))}
        />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Today's Field Skill(s)</h2>
        <FieldSkillPicker
          dayNumber={day.dayNumber}
          library={fieldSkillLibrary.map((s) => ({ id: s.id, labelEn: s.labelEn }))}
          selectedIds={day.fieldSkills.map((s) => s.fieldSkill.id)}
        />
      </section>
    </div>
  );
}
