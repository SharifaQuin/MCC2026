import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getChecklistTasksForRole } from "@/lib/financials";
import { getAreaAccessForUser } from "@/lib/officeAssistant";
import ChecklistManager from "@/components/ChecklistManager";
import OfficeAssistantChecklist from "@/components/OfficeAssistantChecklist";

// The full checklist manager as its own page — same data and actions as the
// one that used to live inside /financials, just reachable directly from
// the nav instead of requiring a trip through the financials tab.
export default async function TodoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role === "OFFICE_ASSISTANT") {
    const access = await getAreaAccessForUser(session.sub, "ASSIGNED_TASKS");
    if (!access.canView) redirect("/");
    const tasks = await getChecklistTasksForRole("OFFICE_ASSISTANT", session.sub);
    const rows = tasks.map((t) => ({
      id: t.id,
      task: t.task,
      effectiveStatus: t.effectiveStatus,
      notes: t.notes,
      targetDate: t.targetDate ? t.targetDate.toISOString() : null,
      dueFridayOfWeek: t.dueFridayOfWeek,
      frequency: t.frequency,
    }));
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold">To-Do List</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Your assigned and shared office tasks. Owner-only tasks aren&apos;t shown here.
        </p>
        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <OfficeAssistantChecklist tasks={rows} canEdit={access.canEdit} />
        </section>
      </div>
    );
  }

  if (session.role !== "ADMIN") redirect("/");

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
