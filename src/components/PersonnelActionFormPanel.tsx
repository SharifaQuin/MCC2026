"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createPafAction,
  approvePafAction,
  executePafAction,
  deletePafAction,
  PafState,
} from "@/app/actions/paf";
import { PAF_ACTION_TYPE_LABELS, PAF_STATUS_LABELS } from "@/lib/paf";
import type { PafActionType, PafStatus } from "@prisma/client";

export interface PafRow {
  id: string;
  actionType: PafActionType;
  effectiveDate: string;
  priorTitle: string | null;
  newTitle: string | null;
  priorPay: number | null;
  newPay: number | null;
  priorDepartment: string | null;
  newDepartment: string | null;
  reason: string | null;
  linkedAssessmentId: string | null;
  status: PafStatus;
  createdByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<PafStatus, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  APPROVED: "bg-amber-100 text-amber-700",
  EXECUTED: "bg-green-100 text-green-700",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save PAF"}
    </button>
  );
}

function NewPafForm({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const action = createPafAction.bind(null, employeeId);
  const [state, formAction] = useFormState<PafState, FormData>(action, {});

  if (state.success) onClose();

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Action type</label>
          <select name="actionType" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
            {Object.entries(PAF_ACTION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Effective date</label>
          <input
            type="date"
            name="effectiveDate"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Prior title</label>
          <input name="priorTitle" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">New title</label>
          <input name="newTitle" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Prior pay ($/hr)</label>
          <input type="number" step="0.01" name="priorPay" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">New pay ($/hr)</label>
          <input type="number" step="0.01" name="newPay" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Prior department</label>
          <input name="priorDepartment" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">New department</label>
          <input name="newDepartment" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">Reason</label>
        <textarea name="reason" rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

function PafItem({ employeeId, paf, canManage }: { employeeId: string; paf: PafRow; canManage: boolean }) {
  const [pending, startTransition] = useTransition();

  const changes: { label: string; from: string | null; to: string | null }[] = [
    { label: "Title", from: paf.priorTitle, to: paf.newTitle },
    { label: "Pay", from: paf.priorPay != null ? `$${paf.priorPay.toFixed(2)}/hr` : null, to: paf.newPay != null ? `$${paf.newPay.toFixed(2)}/hr` : null },
    { label: "Department", from: paf.priorDepartment, to: paf.newDepartment },
  ].filter((c) => c.from || c.to);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-900">
            {PAF_ACTION_TYPE_LABELS[paf.actionType]}
            {paf.linkedAssessmentId && (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-500">
                from promotion assessment
              </span>
            )}
          </p>
          <p className="text-xs text-neutral-500">
            Effective {new Date(paf.effectiveDate).toLocaleDateString()} · created by {paf.createdByName}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[paf.status]}`}>
          {PAF_STATUS_LABELS[paf.status]}
        </span>
      </div>

      {changes.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600">
          {changes.map((c) => (
            <div key={c.label} className="col-span-2 grid grid-cols-2">
              <dt className="font-medium">{c.label}</dt>
              <dd>
                {c.from ?? "—"} → {c.to ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {paf.reason && <p className="mt-2 text-xs text-neutral-600">{paf.reason}</p>}

      {paf.approvedByName && (
        <p className="mt-2 text-xs text-neutral-500">
          Approved by {paf.approvedByName}
          {paf.approvedAt ? ` on ${new Date(paf.approvedAt).toLocaleDateString()}` : ""}
        </p>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-2">
          {paf.status === "DRAFT" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => approvePafAction(paf.id, employeeId))}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("Delete this draft PAF?")) {
                    startTransition(() => deletePafAction(paf.id, employeeId));
                  }
                }}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                Delete
              </button>
            </>
          )}
          {paf.status === "APPROVED" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => executePafAction(paf.id, employeeId))}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Mark Executed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PersonnelActionFormPanel({
  employeeId,
  pafs,
  canManage,
}: {
  employeeId: string;
  pafs: PafRow[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {canManage && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New PAF
        </button>
      )}
      {open && <NewPafForm employeeId={employeeId} onClose={() => setOpen(false)} />}

      {pafs.length === 0 ? (
        <p className="text-sm text-neutral-500">No personnel action forms yet.</p>
      ) : (
        <div className="space-y-3">
          {pafs.map((p) => (
            <PafItem key={p.id} employeeId={employeeId} paf={p} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
