"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  setDay3ReadinessAction,
  setDay10ReviewAction,
  recordSealEvaluationAction,
} from "@/app/actions/rookieJourney";
import type { RookieDay3Decision, RookieDay10Decision, SealDecision } from "@prisma/client";

// Kept local (not imported from lib/rookieJourney.ts) so this client
// component never pulls in that file's prisma import into the browser
// bundle — see the comment on rookieJourney.ts's getSealEvaluationHistory.
const SEAL_CATEGORIES: { key: string; label: string }[] = [
  { key: "CLEANING_QUALITY", label: "Cleaning Quality" },
  { key: "EFFICIENCY", label: "Efficiency" },
  { key: "SAFETY", label: "Safety" },
  { key: "RELIABILITY", label: "Reliability" },
  { key: "ATTENDANCE", label: "Attendance" },
  { key: "TEAMWORK", label: "Teamwork" },
  { key: "HOSPITALITY", label: "Hospitality" },
  { key: "COMMUNICATION", label: "Communication" },
  { key: "COACHABILITY", label: "Coachability" },
  { key: "MAMAS_VALUES", label: "MAMAS Values" },
];

type RookieJourneyPosition =
  | { phase: "ROOKIE_DAY"; day: number }
  | { phase: "AWAITING_30"; elapsedDays: number }
  | { phase: "AWAITING_60"; elapsedDays: number }
  | { phase: "AWAITING_90"; elapsedDays: number }
  | { phase: "BEYOND_90"; elapsedDays: number };

interface Day3Info {
  decision: RookieDay3Decision;
  notes: string | null;
  decidedByName: string;
  decidedAt: string;
}

interface Day10Info {
  decision: RookieDay10Decision;
  extensionReason: string | null;
  skillsNeedingDevelopment: string | null;
  newReviewDate: string | null;
  decidedByName: string;
  decidedAt: string;
}

interface SealEvalRow {
  id: string;
  categoryScores: { key: string; score: number; note?: string }[];
  decision: SealDecision;
  notes: string | null;
  evaluatedByName: string;
  evaluatedAt: string;
}

function positionLabel(position: RookieJourneyPosition): string {
  switch (position.phase) {
    case "ROOKIE_DAY":
      return `Rookie Day ${position.day} of 10`;
    case "AWAITING_30":
      return "Working toward the 30-Day MCC Seal of Approval";
    case "AWAITING_60":
      return "Working toward the 60-Day Review";
    case "AWAITING_90":
      return "Working toward the 90-Day Review";
    case "BEYOND_90":
      return "Past the 90-day milestone window";
  }
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-900"
      >
        {title}
        <span className="text-neutral-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-neutral-100 p-4">{children}</div>}
    </div>
  );
}

function Day3Form({ traineeId, existing }: { traineeId: string; existing: Day3Info | null }) {
  const [decision, setDecision] = useState<RookieDay3Decision>(
    existing?.decision ?? "READY_FOR_ROOKIE_SCHEDULE"
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        This is a readiness check, not a certification — it just records whether {"they're"} ready to move into the
        full Rookie schedule.
      </p>
      {existing && (
        <p className="text-xs text-neutral-500">
          Last set by {existing.decidedByName} on {new Date(existing.decidedAt).toLocaleDateString()}.
        </p>
      )}
      <select
        value={decision}
        onChange={(e) => setDecision(e.target.value as RookieDay3Decision)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="READY_FOR_ROOKIE_SCHEDULE">Ready for Rookie Schedule</option>
        <option value="READY_WITH_COACHING">Ready With Coaching</option>
        <option value="ADDITIONAL_TRAINER_TIME_REQUIRED">Additional Trainer Time Required</option>
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setDay3ReadinessAction(traineeId, decision, notes);
            setSaved(true);
          })
        }
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save Day-3 Readiness"}
      </button>
      {saved && !pending && <span className="ml-3 text-sm text-green-700">Saved.</span>}
    </div>
  );
}

function Day10Form({ traineeId, existing }: { traineeId: string; existing: Day10Info | null }) {
  const [decision, setDecision] = useState<RookieDay10Decision>(
    existing?.decision ?? "ROOKIE_TRAINING_COMPLETE"
  );
  const [extensionReason, setExtensionReason] = useState(existing?.extensionReason ?? "");
  const [skillsNeedingDevelopment, setSkillsNeedingDevelopment] = useState(
    existing?.skillsNeedingDevelopment ?? ""
  );
  const [newReviewDate, setNewReviewDate] = useState(
    existing?.newReviewDate ? existing.newReviewDate.slice(0, 10) : ""
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Extending training never changes employment status by itself — it just records why, what needs work, and
        when to look again.
      </p>
      {existing && (
        <p className="text-xs text-neutral-500">
          Last set by {existing.decidedByName} on {new Date(existing.decidedAt).toLocaleDateString()}.
        </p>
      )}
      <select
        value={decision}
        onChange={(e) => setDecision(e.target.value as RookieDay10Decision)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="ROOKIE_TRAINING_COMPLETE">Rookie Training Complete</option>
        <option value="EXTEND_TRAINING">Extend Training</option>
        <option value="MANAGEMENT_REVIEW_REQUIRED">Management Review Required</option>
      </select>
      {decision === "EXTEND_TRAINING" && (
        <>
          <textarea
            value={extensionReason}
            onChange={(e) => setExtensionReason(e.target.value)}
            placeholder="Reason for extending"
            rows={2}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <textarea
            value={skillsNeedingDevelopment}
            onChange={(e) => setSkillsNeedingDevelopment(e.target.value)}
            placeholder="Skills requiring development"
            rows={2}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={newReviewDate}
            onChange={(e) => setNewReviewDate(e.target.value)}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setDay10ReviewAction(traineeId, decision, {
              extensionReason: decision === "EXTEND_TRAINING" ? extensionReason : undefined,
              skillsNeedingDevelopment: decision === "EXTEND_TRAINING" ? skillsNeedingDevelopment : undefined,
              newReviewDate: decision === "EXTEND_TRAINING" ? newReviewDate : undefined,
            });
            setSaved(true);
          })
        }
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save Day-10 Review"}
      </button>
      {saved && !pending && <span className="ml-3 text-sm text-green-700">Saved.</span>}
    </div>
  );
}

function SealForm({ traineeId, history }: { traineeId: string; history: SealEvalRow[] }) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [decision, setDecision] = useState<SealDecision>("MCC_SEAL_APPROVED");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const allScored = SEAL_CATEGORIES.every((c) => scores[c.key]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        This does not automatically certify — an Admin/Service Manager still makes the final call through the
        Certification panel above, now informed by this evaluation.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SEAL_CATEGORIES.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-2">
            <span className="text-sm">{c.label}</span>
            <select
              value={scores[c.key] ?? ""}
              onChange={(e) => setScores((s) => ({ ...s, [c.key]: Number(e.target.value) }))}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="" disabled>
                —
              </option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <select
        value={decision}
        onChange={(e) => setDecision(e.target.value as SealDecision)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="MCC_SEAL_APPROVED">MCC Seal Approved</option>
        <option value="DEVELOPMENT_EXTENDED">Development Extended</option>
        <option value="MANAGEMENT_REVIEW_REQUIRED">Management Review Required</option>
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={pending || !allScored}
        onClick={() =>
          startTransition(async () => {
            await recordSealEvaluationAction(
              traineeId,
              SEAL_CATEGORIES.map((c) => ({ key: c.key, score: scores[c.key] })),
              decision,
              notes
            );
            setSaved(true);
          })
        }
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save Seal Evaluation"}
      </button>
      {!allScored && <p className="text-xs text-neutral-400">Score every category to save.</p>}
      {saved && !pending && <span className="ml-3 text-sm text-green-700">Saved.</span>}

      {history.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">History</p>
          {history.map((h) => (
            <div key={h.id} className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-600">
              {new Date(h.evaluatedAt).toLocaleDateString()} · {h.evaluatedByName} ·{" "}
              <span className="font-medium">{h.decision.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RookieJourneyPanel({
  traineeId,
  position,
  day3,
  day10,
  sealHistory,
}: {
  traineeId: string;
  position: RookieJourneyPosition;
  day3: Day3Info | null;
  day10: Day10Info | null;
  sealHistory: SealEvalRow[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-neutral-900">Rookie Journey</h2>
        <Link
          href={`/trainer/employees/${traineeId}/checkoff`}
          className="rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
        >
          Open Daily Field Checkoff
        </Link>
      </div>
      <p className="text-sm text-neutral-600">{positionLabel(position)}</p>

      <Collapsible title="Day-3 Readiness Check" defaultOpen={position.phase === "ROOKIE_DAY" && position.day <= 4}>
        <Day3Form traineeId={traineeId} existing={day3} />
      </Collapsible>
      <Collapsible
        title="Day-10 Rookie Training Review"
        defaultOpen={position.phase === "ROOKIE_DAY" && position.day >= 9}
      >
        <Day10Form traineeId={traineeId} existing={day10} />
      </Collapsible>
      <Collapsible title="Day-30 MCC Seal of Approval" defaultOpen={position.phase === "AWAITING_30"}>
        <SealForm traineeId={traineeId} history={sealHistory} />
      </Collapsible>
    </div>
  );
}
