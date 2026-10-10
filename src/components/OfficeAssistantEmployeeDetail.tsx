import type { getOfficeAssistantEmployeeDetail } from "@/lib/officeAssistantStaff";

type Detail = NonNullable<Awaited<ReturnType<typeof getOfficeAssistantEmployeeDetail>>>;

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-sm text-neutral-900">{value ?? "—"}</p>
    </div>
  );
}

// The bounded Office Assistant view of a single employee — only work
// contact, employment status, onboarding/training milestones, and assigned
// supervisor/pair. No pay, payroll, banking/tax, disciplinary, medical, or
// account-management fields ever reach this component because the data
// loader behind it (src/lib/officeAssistantStaff.ts) never fetches them.
export default function OfficeAssistantEmployeeDetail({ data }: { data: Detail }) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-medium text-neutral-900">{data.name}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Employee ID" value={data.employeeId} />
          <Field label="Role" value={data.roleLabel} />
          <Field label="Employment Status" value={data.employmentStatus} />
          <Field label="Work Phone" value={data.phone} />
          <Field label="Office / Crew" value={[data.officeLocation, data.crewType].filter(Boolean).join(" / ") || null} />
          <Field label="Supervisor" value={data.supervisorName} />
          {data.currentTrainerName && <Field label="Current Trainer" value={data.currentTrainerName} />}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Onboarding</h2>
        {data.onboarding.length === 0 ? (
          <p className="text-sm text-neutral-500">No onboarding documents assigned.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.onboarding.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-neutral-700">{d.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    d.status === "Completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {d.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Training Milestones</h2>
        {data.milestoneTimeline.length === 0 ? (
          <p className="text-sm text-neutral-500">No milestone timeline available.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.milestoneTimeline.map((m) => (
              <li key={m.checkpoint} className="flex items-center justify-between py-2 text-sm">
                <span className="text-neutral-700">{m.label}</span>
                <span className="text-xs text-neutral-500">
                  Due {new Date(m.dueDate).toLocaleDateString()} · {m.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
