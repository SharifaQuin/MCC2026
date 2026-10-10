import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getChecklistTasksForRole, getChecklistAssigneeCandidates } from "@/lib/financials";
import { getAreaAccessForUser } from "@/lib/officeAssistant";
import ChecklistManager from "@/components/ChecklistManager";
import AssignedChecklist from "@/components/AssignedChecklist";

// The full checklist manager as its own page — same data and actions as the
// one that used to live inside /financials, just reachable directly from
// the nav instead of requiring a trip through the financials tab.
export default async function TodoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role !== "ADMIN") {
    // Office Assistant additionally needs the owner-configured
    // ASSIGNED_TASKS area grant; every other staff role (Trainee/Trainer/
    // Service Manager) has no such area-access layer and can always reach
    // their own shared/assigned tasks here.
    let canView = true;
    let canEdit = true;
    if (session.role === "OFFICE_ASSISTANT") {
      const access = await getAreaAccessForUser(session.sub, "ASSIGNED_TASKS");
      canView = access.canView;
      canEdit = access.canEdit;
    }
    if (!canView) redirect("/");

    const tasks = await getChecklistTasksForRole(session.role, session.sub);
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
          Your assigned and shared tasks. Owner-only tasks aren&apos;t shown here.
        </p>
        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <AssignedChecklist tasks={rows} canEdit={canEdit} />
        </section>
      </div>
    );
  }

  const [checklistTasks, assignees] = await Promise.all([
    getChecklistTasksForRole("ADMIN"),
    getChecklistAssigneeCandidates(),
  ]);
  const assigneeNameById = new Map(assignees.map((a) => [a.id, a.name]));

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
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeId ? (assigneeNameById.get(t.assigneeId) ?? null) : null,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">To-Do List</h1>
      <p className="mb-6 text-sm text-neutral-500">Owner-only checklist — same list as the Home sidebar and /financials.</p>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <ChecklistManager tasks={checklistRows} assignees={assignees} />
      </section>
    </div>
  );
}
