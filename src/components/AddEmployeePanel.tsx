"use client";

import { useState } from "react";
import InviteEmployeeForm from "@/components/InviteEmployeeForm";
import BulkInviteEmployeeForm from "@/components/BulkInviteEmployeeForm";

export default function AddEmployeePanel() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        + Add Employee
      </button>
    );
  }

  return (
    <div className="space-y-8 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Add Employee</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Close
        </button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">One at a Time</h3>
        <InviteEmployeeForm />
      </div>

      <div className="border-t border-neutral-200 pt-6">
        <h3 className="mb-1 text-sm font-semibold text-neutral-700">Bulk Import via CSV</h3>
        <p className="mb-3 text-sm text-neutral-500">
          Add or enrich multiple employees at once by uploading a CSV file.
        </p>
        <BulkInviteEmployeeForm />
      </div>
    </div>
  );
}
