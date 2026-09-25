import Link from "next/link";
import { getAllRookieDaysForAdmin } from "@/lib/rookieJourney";
import AddFieldSkillForm from "./AddFieldSkillForm";

export default async function RookieJourneyAdminPage() {
  const days = await getAllRookieDaysForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rookie Journey — Admin Configuration</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Configure each Rookie Day's content, assign existing lessons and field skills to it, and manage the
          field-skill checklist library. None of the 172 existing lessons are assigned to a day automatically —
          use{" "}
          <Link href="/admin/rookie-journey/lessons" className="text-brand-700 hover:underline">
            Assign Lessons
          </Link>{" "}
          to build the mapping yourself.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Est. Academy Time</th>
              <th className="px-4 py-3">Lessons</th>
              <th className="px-4 py-3">Field Skills</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-medium">{d.dayNumber}</td>
                <td className="px-4 py-3">{d.titleEn}</td>
                <td className="px-4 py-3">{d.estimatedAcademyMinutes} min</td>
                <td className="px-4 py-3">{d.lessons.length}</td>
                <td className="px-4 py-3">{d.fieldSkills.length}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/rookie-journey/${d.dayNumber}`} className="text-brand-700 hover:underline">
                    Edit →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Field Skill Library</h2>
        <AddFieldSkillForm />
      </div>
    </div>
  );
}
