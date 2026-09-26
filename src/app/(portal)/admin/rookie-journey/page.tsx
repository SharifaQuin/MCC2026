import Link from "next/link";
import { getAllRookieDaysForAdmin, getTrainingExperienceVersion } from "@/lib/rookieJourney";
import { setTrainingExperienceVersionAction } from "@/app/actions/rookieJourney";
import AddFieldSkillForm from "./AddFieldSkillForm";

export default async function RookieJourneyAdminPage() {
  const [days, trainingVersion] = await Promise.all([getAllRookieDaysForAdmin(), getTrainingExperienceVersion()]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-medium text-neutral-900">Trainee Training Experience</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Controls what every current Trainee sees as their home page and lesson flow. Switching doesn&apos;t
          touch any historical progress, quiz attempts, or field evaluations either way — it only changes which
          experience is shown going forward, and can be switched back at any time.
        </p>
        <form action={setTrainingExperienceVersionAction} className="space-y-3">
          <label className="flex items-start gap-3 rounded-md border border-neutral-200 p-3 hover:bg-neutral-50">
            <input type="radio" name="version" value="rookie" defaultChecked={trainingVersion === "rookie"} className="mt-1" />
            <span>
              <span className="block font-medium text-neutral-900">Rookie Journey (Recommended)</span>
              <span className="block text-sm text-neutral-500">
                The Day 1-10 → 30/60/90 mobile-first dashboard below. Lessons reached through a Rookie Day stay
                inside the Rookie flow — &quot;Continue&quot; moves to the next Rookie item, not the rest of that
                lesson&apos;s module.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-neutral-200 p-3 hover:bg-neutral-50">
            <input type="radio" name="version" value="classic" defaultChecked={trainingVersion === "classic"} className="mt-1" />
            <span>
              <span className="block font-medium text-neutral-900">Classic (Original)</span>
              <span className="block text-sm text-neutral-500">
                The original Trainee home page and full linear module-by-module course, unchanged.
              </span>
            </span>
          </label>
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Save
          </button>
        </form>
      </div>

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
