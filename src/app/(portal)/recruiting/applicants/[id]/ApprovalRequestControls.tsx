"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  submitApprovalRequestAction,
  withdrawApprovalRequestAction,
  decideApprovalRequestAction,
  markApprovalExecutedAction,
  retryApprovalExecutionAction,
} from "@/app/actions/approvals";

export interface ApprovalRequestRow {
  id: string;
  requesterName: string;
  managerName: string;
  actionType:
    | "REJECT_APPLICANT"
    | "OFFER_APPLICANT"
    | "SEND_MESSAGE"
    | "SCHEDULE_IN_PERSON_INTERVIEW"
    | "SCHEDULE_WORKING_SESSION";
  rationale: string;
  proposedOutcome: string;
  recipientEmail: string | null;
  messageText: string | null;
  // SCHEDULE_IN_PERSON_INTERVIEW/SCHEDULE_WORKING_SESSION only. ISO strings
  // (for editable datetime-local inputs) alongside a server-formatted,
  // business-timezone display string — the same split
  // e2e/scheduled-message-reliability's ScheduledMessagesList already uses,
  // so a client component never has to guess which zone to render in.
  proposedScheduledAt: string | null;
  proposedScheduledAtDisplay: string | null;
  decidedScheduledAt: string | null;
  decidedScheduledAtDisplay: string | null;
  executionStatus: "IN_PROGRESS" | "SUCCEEDED" | "PARTIAL" | "FAILED" | null;
  executionError: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN" | "NEEDS_RESUBMISSION";
  decisionNote: string | null;
  decidedByName: string | null;
  executedAt: string | null;
  isMine: boolean;
  canDecide: boolean;
  canMarkExecuted: boolean;
  canRetryExecution: boolean;
  // Only set on the cross-applicant manager queue (/recruiting/approvals),
  // where each row needs to link back to its own applicant.
  applicantId?: string;
  applicantName?: string;
}

const ACTION_LABELS: Record<ApprovalRequestRow["actionType"], string> = {
  REJECT_APPLICANT: "Reject applicant",
  OFFER_APPLICANT: "Send offer",
  SEND_MESSAGE: "Send a message",
  SCHEDULE_IN_PERSON_INTERVIEW: "Request in-person interview",
  SCHEDULE_WORKING_SESSION: "Request working session",
};

const SCHEDULING_ACTION_TYPES = new Set<ApprovalRequestRow["actionType"]>([
  "SCHEDULE_IN_PERSON_INTERVIEW",
  "SCHEDULE_WORKING_SESSION",
]);

const EXECUTION_BANNER: Record<NonNullable<ApprovalRequestRow["executionStatus"]>, { style: string; label: string }> = {
  IN_PROGRESS: { style: "bg-neutral-100 text-neutral-600", label: "Executing…" },
  SUCCEEDED: { style: "bg-green-100 text-green-700", label: "Done" },
  PARTIAL: { style: "bg-amber-100 text-amber-700", label: "Partially completed" },
  FAILED: { style: "bg-red-100 text-red-700", label: "Failed" },
};

const STATUS_STYLES: Record<ApprovalRequestRow["status"], string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-neutral-100 text-neutral-500",
  NEEDS_RESUBMISSION: "bg-orange-100 text-orange-700",
};

// Reads an ISO string back as the Pacific wall-clock value a datetime-local
// input expects — same helper (same reasoning) as
// ScheduledMessagesList.tsx's toLocalInputValue.
function toLocalInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function RequestRow({ row }: { row: ApprovalRequestRow }) {
  const [pending, startTransition] = useTransition();
  const [decisionNote, setDecisionNote] = useState("");
  const [decidedScheduledAt, setDecidedScheduledAt] = useState(() =>
    row.proposedScheduledAt ? toLocalInputValue(row.proposedScheduledAt) : ""
  );
  const [retryScheduledAt, setRetryScheduledAt] = useState(() =>
    row.decidedScheduledAt ? toLocalInputValue(row.decidedScheduledAt) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const isScheduling = SCHEDULING_ACTION_TYPES.has(row.actionType);

  function decide(decision: "APPROVED" | "DECLINED") {
    setError(null);
    startTransition(async () => {
      const res = await decideApprovalRequestAction(
        row.id,
        decision,
        decisionNote,
        isScheduling && decision === "APPROVED" ? decidedScheduledAt : undefined
      );
      if (!res.ok) setError(res.error ?? "Couldn't record a decision.");
    });
  }

  function withdraw() {
    if (!confirm("Withdraw this request?")) return;
    setError(null);
    startTransition(async () => {
      const res = await withdrawApprovalRequestAction(row.id);
      if (!res.ok) setError(res.error ?? "Couldn't withdraw.");
    });
  }

  function markExecuted() {
    setError(null);
    startTransition(async () => {
      const res = await markApprovalExecutedAction(row.id);
      if (!res.ok) setError(res.error ?? "Couldn't mark as done.");
    });
  }

  function retryExecution() {
    setError(null);
    startTransition(async () => {
      const res = await retryApprovalExecutionAction(row.id, retryScheduledAt || undefined);
      if (!res.ok) setError(res.error ?? "Couldn't retry.");
    });
  }

  const executionBanner = row.executionStatus ? EXECUTION_BANNER[row.executionStatus] : null;

  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-neutral-900">
            {ACTION_LABELS[row.actionType]}
            {row.applicantId && row.applicantName && (
              <>
                {" "}
                for{" "}
                <Link href={`/recruiting/applicants/${row.applicantId}`} className="text-brand-700 hover:underline">
                  {row.applicantName}
                </Link>
              </>
            )}
          </p>
          <p className="text-xs text-neutral-500">
            {row.requesterName} → {row.managerName}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}>
            {row.status === "NEEDS_RESUBMISSION" ? "Needs resubmission" : row.status}
          </span>
          {executionBanner && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${executionBanner.style}`}>
              {executionBanner.label}
            </span>
          )}
        </div>
      </div>

      {isScheduling ? (
        <>
          <p className="mt-2 text-xs text-neutral-600">
            <span className="font-medium">Note:</span> {row.rationale}
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            <span className="font-medium">Proposed:</span> {row.proposedScheduledAtDisplay}
          </p>
          {row.decidedScheduledAtDisplay && (
            <p className="mt-1 text-xs text-neutral-600">
              <span className="font-medium">
                {row.status === "DECLINED" ? "Reviewed as:" : "Approved for:"}
              </span>{" "}
              {row.decidedScheduledAtDisplay}
              {row.decidedScheduledAt !== row.proposedScheduledAt && " (changed from proposed)"}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-neutral-600">
            <span className="font-medium">Rationale:</span> {row.rationale}
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            <span className="font-medium">Proposed outcome:</span> {row.proposedOutcome}
          </p>
        </>
      )}
      {row.recipientEmail && (
        <p className="mt-1 text-xs text-neutral-600">
          <span className="font-medium">To:</span> {row.recipientEmail}
        </p>
      )}
      {row.messageText && (
        <p className="mt-1 whitespace-pre-wrap rounded-md bg-neutral-50 p-2 text-xs text-neutral-700">{row.messageText}</p>
      )}
      {row.decisionNote && (
        <p className="mt-2 text-xs text-neutral-600">
          <span className="font-medium">Decision note ({row.decidedByName}):</span> {row.decisionNote}
        </p>
      )}
      {!isScheduling && row.executedAt && (
        <p className="mt-1 text-xs text-green-700">Manager completed the manual action.</p>
      )}
      {executionBanner && row.executionError && (
        <p className={`mt-1 text-xs ${row.executionStatus === "FAILED" ? "text-red-700" : "text-amber-700"}`}>
          {row.executionError}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {row.isMine && row.status === "PENDING" && (
          <button
            type="button"
            onClick={withdraw}
            disabled={pending}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            Withdraw
          </button>
        )}
        {row.canDecide && row.status === "PENDING" && (
          <>
            {isScheduling && (
              <input
                type="datetime-local"
                value={decidedScheduledAt}
                onChange={(e) => setDecidedScheduledAt(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
              />
            )}
            <input
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="Decision note (optional)"
              className="w-48 rounded-md border border-neutral-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => decide("APPROVED")}
              disabled={pending}
              className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => decide("DECLINED")}
              disabled={pending}
              className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Decline
            </button>
          </>
        )}
        {!isScheduling && row.canMarkExecuted && row.status === "APPROVED" && !row.executedAt && (
          <button
            type="button"
            onClick={markExecuted}
            disabled={pending}
            className="rounded-md border border-green-300 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-60"
          >
            I've completed this manually — mark done
          </button>
        )}
        {isScheduling &&
          row.canRetryExecution &&
          row.status === "APPROVED" &&
          (row.executionStatus === "FAILED" || row.executionStatus === "PARTIAL") && (
            <>
              {row.actionType === "SCHEDULE_IN_PERSON_INTERVIEW" && row.executionStatus === "FAILED" && (
                <input
                  type="datetime-local"
                  value={retryScheduledAt}
                  onChange={(e) => setRetryScheduledAt(e.target.value)}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
                />
              )}
              <button
                type="button"
                onClick={retryExecution}
                disabled={pending}
                className="rounded-md border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
              >
                Retry
              </button>
            </>
          )}
      </div>
    </div>
  );
}

export default function ApprovalRequestControls({
  applicantId,
  canSubmit,
  rows,
  initialOpenReject,
}: {
  applicantId: string;
  canSubmit: boolean;
  rows: ApprovalRequestRow[];
  // StageControls' "Request rejection" link lands here with this true —
  // opens the composer already on REJECT_APPLICANT instead of making the
  // Office Assistant find and click "Request Approval" and pick it
  // themselves.
  initialOpenReject?: boolean;
}) {
  const [open, setOpen] = useState(() => Boolean(initialOpenReject));
  const [actionType, setActionType] = useState<ApprovalRequestRow["actionType"]>("REJECT_APPLICANT");

  // StageControls' "Request rejection" link only changes the URL's search
  // params/hash — the same route, so this already-mounted client component
  // is reused rather than remounted, and the lazy useState initializer
  // above never fires again on its own. React this prop's later changes
  // explicitly instead of assuming a fresh mount.
  useEffect(() => {
    if (initialOpenReject) setOpen(true);
  }, [initialOpenReject]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isScheduling = SCHEDULING_ACTION_TYPES.has(actionType);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await submitApprovalRequestAction(formData);
      if (!res.ok) {
        setError(res.error ?? "Couldn't submit.");
        return;
      }
      setOpen(false);
    });
  }

  return (
    <div className="space-y-3">
      {canSubmit && (
        <div>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Request Approval
            </button>
          ) : (
            <form
              action={submit}
              className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
            >
              <input type="hidden" name="applicantId" value={applicantId} />
              <select
                name="actionType"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ApprovalRequestRow["actionType"])}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="REJECT_APPLICANT">Reject applicant</option>
                <option value="OFFER_APPLICANT">Send offer</option>
                <option value="SEND_MESSAGE">Send a message</option>
                <option value="SCHEDULE_IN_PERSON_INTERVIEW">Request in-person interview</option>
                <option value="SCHEDULE_WORKING_SESSION">Request working session</option>
              </select>
              {isScheduling ? (
                <>
                  <p className="text-xs font-medium text-neutral-500">Request next step</p>
                  <input
                    name="proposedScheduledAt"
                    type="datetime-local"
                    required
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    name="rationale"
                    placeholder="Note for the manager"
                    rows={2}
                    required
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </>
              ) : (
                <>
                  <textarea
                    name="rationale"
                    placeholder="Why are you requesting this?"
                    rows={2}
                    required
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    name="proposedOutcome"
                    placeholder="Exact proposed outcome/terms (e.g. 'Decline — did not meet availability' or 'Offer $19/hr, start Mon Oct 19')"
                    rows={2}
                    required
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </>
              )}
              {actionType === "SEND_MESSAGE" && (
                <>
                  <input
                    name="recipientEmail"
                    type="email"
                    placeholder="Exact recipient email"
                    required
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    name="messageText"
                    placeholder="Exact final message text"
                    rows={3}
                    required
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {pending ? "Submitting..." : "Submit Request"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">No approval requests for this applicant.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <RequestRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
