import Link from "next/link";
import { getLessonAssignmentOptions } from "@/lib/rookieJourney";
import LessonAssignmentTable from "./LessonAssignmentTable";

export default async function RookieLessonAssignmentPage() {
  const lessons = await getLessonAssignmentOptions();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/rookie-journey" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          ← Back to Rookie Journey
        </Link>
        <h1 className="text-2xl font-semibold">Assign Lessons</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every existing lesson, in module order. Assign one to a Rookie Day or to the Knowledge Library — this
          links the existing lesson, it never duplicates it. Anything left "Unassigned" stays exactly as it is
          today, reachable through the full Academy at /modules.
        </p>
      </div>
      <LessonAssignmentTable lessons={lessons} />
    </div>
  );
}
