"use client";

import { useState, useTransition } from "react";
import type { LeadStage } from "@prisma/client";
import { setLeadStageAction, markLeadLostAction } from "../actions";
import { LEAD_STAGE_LABELS } from "@/lib/leads";

const NEXT_STAGES: Record<string, LeadStage[]> = {
  NEW_INQUIRY: ["CONTACTED"],
  CONTACTED: ["QUOTED", "LOST"],
  QUOTED: ["WON", "LOST"],
  WON: [],
  LOST: ["CONTACTED"],
};

export default function LeadStageControls({
  leadId,
  stage,
}: {
  leadId: string;
  stage: LeadStage;
}) {
  const [pending, startTransition] = useTransition();
  const [losing, setLosing] = useState(false);
  const options = NEXT_STAGES[stage] ?? [];

  if (options.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((next) => (
          <button
            key={next}
            type="button"
            disabled={pending}
            onClick={() => {
              if (next === "LOST") {
                setLosing(true);
              } else {
                startTransition(() => setLeadStageAction(leadId, next));
              }
            }}
            className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60 ${
              next === "LOST"
                ? "border border-red-300 text-red-700 hover:bg-red-50"
                : "bg-brand-600 text-white hover:bg-brand-700"
            }`}
          >
            Move to: {LEAD_STAGE_LABELS[next]}
          </button>
        ))}
      </div>

      {losing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const reason = String(formData.get("lostReason") ?? "");
            startTransition(async () => {
              await markLeadLostAction(leadId, reason);
              setLosing(false);
            });
          }}
          className="flex flex-wrap items-end gap-2 rounded-md border border-red-200 bg-red-50 p-3"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Why was this lead lost? (optional)
            </label>
            <input
              name="lostReason"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              placeholder="e.g. Went with a competitor, price too high"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "..." : "Mark Lost"}
          </button>
          <button
            type="button"
            onClick={() => setLosing(false)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
