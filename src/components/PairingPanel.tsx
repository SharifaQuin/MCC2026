"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPairAction, endPairAction, PairState } from "@/app/actions/pairs";
import type { PairHistoryRow } from "@/lib/pairing";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Pairing"}
    </button>
  );
}

function AssignPairForm({
  employeeId,
  candidates,
  onClose,
}: {
  employeeId: string;
  candidates: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [employeeRole, setEmployeeRole] = useState<"LEAD" | "ASSISTANT">("LEAD");
  const action = createPairAction.bind(null, employeeId, employeeRole);
  const [state, formAction] = useFormState<PairState, FormData>(action, {});

  if (state.success) onClose();

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium">This employee is the</label>
        <select
          value={employeeRole}
          onChange={(e) => setEmployeeRole(e.target.value as "LEAD" | "ASSISTANT")}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="LEAD">Lead</option>
          <option value="ASSISTANT">Assistant</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">
          Paired with (the {employeeRole === "LEAD" ? "Assistant" : "Lead"})
        </label>
        <select name="partnerId" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">Choose a partner...</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Start date</label>
        <input
          type="date"
          name="startDate"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
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

export default function PairingPanel({
  employeeId,
  currentPair,
  history,
  candidates,
}: {
  employeeId: string;
  currentPair: { pairId: string; role: "LEAD" | "ASSISTANT"; partnerId: string; partnerName: string; startDate: string } | null;
  history: PairHistoryRow[];
  candidates: { id: string; name: string }[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {currentPair ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              {currentPair.role === "LEAD" ? "Lead" : "Assistant"} — paired with{" "}
              <span className="font-semibold">{currentPair.partnerName}</span>
            </p>
            <p className="text-xs text-neutral-500">Since {new Date(currentPair.startDate).toLocaleDateString()}</p>
          </div>
          <div className="flex gap-3">
            {!formOpen && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Change
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("End this pairing?")) {
                  startTransition(() => endPairAction(currentPair.pairId, employeeId, currentPair.partnerId));
                }
              }}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              End Pairing
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-neutral-300 p-4">
          <p className="text-sm text-neutral-500">Not currently paired.</p>
          {!formOpen && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + Assign Pairing
            </button>
          )}
        </div>
      )}

      {formOpen && (
        <AssignPairForm employeeId={employeeId} candidates={candidates} onClose={() => setFormOpen(false)} />
      )}

      {history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="text-xs font-medium text-neutral-500 hover:underline"
          >
            {showHistory ? "Hide" : "Show"} pairing history ({history.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-xs">
                  <span>
                    {h.role === "LEAD" ? "Lead" : "Assistant"} with <strong>{h.partnerName}</strong>
                  </span>
                  <span className="text-neutral-500">
                    {new Date(h.startDate).toLocaleDateString()} –{" "}
                    {h.endDate ? new Date(h.endDate).toLocaleDateString() : "present"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
