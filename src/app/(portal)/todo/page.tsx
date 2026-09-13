import { getChecklistTasksForRole } from "@/lib/financials";
import ChecklistManager from "@/components/ChecklistManager";

// The full checklist manager as its own page — same data and actions as the
// one that used to live inside /financials, just reachable directly from
// the nav instead of requiring a trip through the financials tab.
export default async function TodoPage() {
  const checklistTasks = await getChecklistTasksForRole("ADMIN");

  const checklistRows = checklistTasks.map((t) => ({
    id: t.id,
    frequency: t.frequency,
    task: t.task,
    owner: t.owner,
    visibility: t.visibility,
    effectiveStatus: t.effectiveStatus,
    category: t.category,
    notes: t.notes,
    targetDate: t.targetDate ? t.targetDate.toISOString() : null,
    dueFridayOfWeek: t.dueFridayOfWeek,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">To-Do List</h1>
      <p className="mb-6 text-sm text-neutral-500">Owner-only checklist — same list as the Home sidebar and /financials.</p>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <ChecklistManager tasks={checklistRows} />
      </section>
    </div>
  );
}
