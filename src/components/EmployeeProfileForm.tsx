"use client";

import { useState, useTransition } from "react";
import { setEmployeeProfileFieldsAction } from "@/app/actions/staff";
import type { EmploymentType } from "@prisma/client";

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
};

export interface EmployeeProfileFields {
  phone: string | null;
  address: string | null;
  employmentType: EmploymentType | null;
  officeLocation: string | null;
  crewType: string | null;
  managerName: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-sm text-neutral-900">{value ?? "—"}</p>
    </div>
  );
}

export default function EmployeeProfileForm({
  userId,
  fields,
}: {
  userId: string;
  fields: EmployeeProfileFields;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const action = setEmployeeProfileFieldsAction.bind(null, userId);

  if (!editing) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Phone" value={fields.phone} />
          <Field label="Address" value={fields.address} />
          <Field
            label="Employment Type"
            value={fields.employmentType ? EMPLOYMENT_TYPE_LABELS[fields.employmentType] : null}
          />
          <Field label="Location" value={fields.officeLocation} />
          <Field label="Team" value={fields.crewType} />
          <Field label="Manager" value={fields.managerName} />
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-xs font-medium text-brand-700 hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      action={(formData) => startTransition(() => action(formData).then(() => setEditing(false)))}
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium">Phone</label>
          <input
            name="phone"
            defaultValue={fields.phone ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Address</label>
          <input
            name="address"
            defaultValue={fields.address ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Employment Type</label>
          <select
            name="employmentType"
            defaultValue={fields.employmentType ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Not set</option>
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Location</label>
          <input
            name="officeLocation"
            defaultValue={fields.officeLocation ?? ""}
            placeholder="e.g. Tustin"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Team</label>
          <input
            name="crewType"
            defaultValue={fields.crewType ?? ""}
            placeholder="e.g. Field Team, Office Team"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Manager</label>
          <input
            name="managerName"
            defaultValue={fields.managerName ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs font-medium text-neutral-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
