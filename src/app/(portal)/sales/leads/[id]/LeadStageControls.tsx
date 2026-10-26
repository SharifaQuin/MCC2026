"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeadStage } from "@prisma/client";
import { setLeadStageAction, markLeadLostAction, markLeadScamAction } from "../actions";
import { LEAD_STAGE_LABELS } from "@/lib/leads";

const NEXT_STAGES: Record<string, LeadStage[]> = {
  NEW_INQUIRY: ["CONTACTED"],
  CONTACTED: ["QUOTED", "LOST"],
  QUOTED: ["WON", "LOST"],
  WON: [],
  LOST: ["CONTACTED"],
};

// WON is excluded here too (same reasoning as NEXT_STAGES.WON being empty)
// — this is still only UI-level politeness, not the real guard. The real
// guard is markLeadScamAction's own server-side WON check; this list just
// keeps the button from appearing somewhere it would only ever be refused.
const SCAM_ELIGIBLE_STAGES = new Set<LeadStage>(["NEW_INQUIRY", "CONTACTED", "QUOTED", "LOST"]);

export default function LeadStageControls({
  leadId,
  stage,
  expectedUpdatedAt,
}: {
  leadId: string;
  stage: LeadStage;
  expectedUpdatedAt: string;
}) {
  const [pending, startTransition] = useTransition();
  const [losing, setLosing] = useState(false);
  const [scamming, setScamming] = useState(false);
  const [scamError, setScamError] = useState<string | null>(null);
  const router = useRouter();
  const options = NEXT_STAGES[stage] ?? [];
  const canMarkScam = stage !== "SCAM" && SCAM_ELIGIBLE_STAGES.has(stage);

  if (options.length === 0 && !canMarkScam) return null;

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

        {/* Deliberately styled nothing like the Lost button (black, not
            red) and placed with a gap from it — the owner asked for this
            to read as visually/clearly separate from "Lost", on both
            desktop and mobile (same markup renders both, no separate
            layout needed). */}
        {canMarkScam && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setScamError(null);
              setScamming(true);
            }}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
          >
            Mark as Scam
          </button>
        )}
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

      {scamming && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // The owner explicitly wants a real confirm step here (unlike
            // Lost's own inline form, which has none) — this is a harder-
            // to-reverse, security-sensitive classification.
            if (!confirm("Mark this lead as Scam? Any pending scheduled sends to them will be cancelled.")) return;
            const formData = new FormData(e.currentTarget);
            const reason = String(formData.get("scamReason") ?? "");
            setScamError(null);
            startTransition(async () => {
              const res = await markLeadScamAction(leadId, expectedUpdatedAt, reason);
              if (!res.ok) {
                setScamError(res.error ?? "Couldn't mark this lead as Scam.");
                return;
              }
              setScamming(false);
              router.refresh();
            });
          }}
          className="flex flex-wrap items-end gap-2 rounded-md border border-neutral-700 bg-neutral-50 p-3"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Why is this a scam contact? (optional)
            </label>
            <input
              name="scamReason"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              placeholder="e.g. Fake address, asked for wire transfer"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
          >
            {pending ? "..." : "Confirm: Mark as Scam"}
          </button>
          <button
            type="button"
            onClick={() => {
              setScamming(false);
              setScamError(null);
            }}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          {scamError && <p className="w-full text-xs text-red-600">{scamError}</p>}
        </form>
      )}
    </div>
  );
}
