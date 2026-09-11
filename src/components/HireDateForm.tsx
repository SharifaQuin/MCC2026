"use client";

import { useState, useTransition } from "react";
import { setHireDateAction } from "@/app/actions/staff";

export default function HireDateForm({
  userId,
  hireDate,
  yearsOfService,
}: {
  userId: string;
  hireDate: string | null;
  yearsOfService: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const action = setHireDateAction.bind(null, userId);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        {hireDate ? (
          <p>
            Hired <span className="font-medium">{new Date(hireDate).toLocaleDateString()}</span>
            {yearsOfService !== null && (
              <span className="text-neutral-500">
                {" "}
                · {yearsOfService} year{yearsOfService === 1 ? "" : "s"} of service
              </span>
            )}
          </p>
        ) : (
          <p className="text-neutral-500">No hire date set.</p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      action={(formData) => startTransition(() => action(formData).then(() => setEditing(false)))}
      className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <input
        type="date"
        name="hireDate"
        defaultValue={hireDate ? hireDate.slice(0, 10) : ""}
        required
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
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
    </form>
  );
}
