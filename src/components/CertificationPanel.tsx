"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  recommendForCertificationAction,
  certifyAction,
  declineAction,
  revertCertificationAction,
  CertActionState,
} from "@/app/actions/certification";

type Status = "NOT_RECOMMENDED" | "PENDING" | "CERTIFIED" | "DECLINED";

interface Props {
  traineeId: string;
  status: Status;
  notes: string | null;
  recommendedAt: Date | null;
  recommendedByName: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  canRecommend: boolean;
  canDecide: boolean;
}

const STATUS_STYLES: Record<Status, string> = {
  NOT_RECOMMENDED: "bg-neutral-100 text-neutral-600",
  PENDING: "bg-amber-100 text-amber-700",
  CERTIFIED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<Status, string> = {
  NOT_RECOMMENDED: "Trainee — Not Yet Recommended",
  PENDING: "Pending Manager Review",
  CERTIFIED: "Certified Technician",
  DECLINED: "Declined — Needs More Field Training",
};

function SubmitButton({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? "..." : label}
    </button>
  );
}

function RecommendForm({ traineeId }: { traineeId: string }) {
  const [open, setOpen] = useState(false);
  const action = recommendForCertificationAction.bind(null, traineeId);
  const [state, formAction] = useFormState<CertActionState, FormData>(action, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Recommend for Certification
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        name="notes"
        rows={2}
        placeholder="Optional notes for the manager (e.g. what you observed in the field)"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-3">
        <SubmitButton
          label="Submit Recommendation"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DecideButtons({ traineeId }: { traineeId: string }) {
  const [declining, setDeclining] = useState(false);
  const [pending, startTransition] = useTransition();
  const declineWithId = declineAction.bind(null, traineeId);
  const [state, formAction] = useFormState<CertActionState, FormData>(declineWithId, {});

  if (declining) {
    return (
      <form action={formAction} className="space-y-3">
        <textarea
          name="notes"
          rows={2}
          required
          placeholder="What does this employee still need to work on?"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex gap-3">
          <SubmitButton
            label="Confirm Decline"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          />
          <button
            type="button"
            onClick={() => setDeclining(false)}
            className="text-sm font-medium text-neutral-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void certifyAction(traineeId);
          })
        }
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {pending ? "..." : "Certify as Technician"}
      </button>
      <button
        type="button"
        onClick={() => setDeclining(true)}
        className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
      >
        Decline
      </button>
    </div>
  );
}

export default function CertificationPanel({
  traineeId,
  status,
  notes,
  recommendedAt,
  recommendedByName,
  decidedAt,
  decidedByName,
  canRecommend,
  canDecide,
}: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">Certification</p>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {recommendedAt && (
        <p className="mb-2 text-xs text-neutral-500">
          Recommended {new Date(recommendedAt).toLocaleDateString()}
          {recommendedByName ? ` by ${recommendedByName}` : ""}
        </p>
      )}
      {decidedAt && (
        <p className="mb-2 text-xs text-neutral-500">
          Decided {new Date(decidedAt).toLocaleDateString()}
          {decidedByName ? ` by ${decidedByName}` : ""}
        </p>
      )}
      {notes && <p className="mb-3 text-sm italic text-neutral-600">&ldquo;{notes}&rdquo;</p>}

      {canRecommend && (status === "NOT_RECOMMENDED" || status === "DECLINED") && (
        <RecommendForm traineeId={traineeId} />
      )}

      {canDecide && status === "PENDING" && <DecideButtons traineeId={traineeId} />}

      {status === "CERTIFIED" && (
        <Link
          href={`/certificate/${traineeId}`}
          className="mb-3 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          View Certificate
        </Link>
      )}

      {canDecide && status === "CERTIFIED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Revert this employee's certification back to not-recommended?")) {
              startTransition(() => revertCertificationAction(traineeId));
            }
          }}
          className="text-xs font-medium text-neutral-400 hover:underline disabled:opacity-60"
        >
          {pending ? "..." : "Revert certification (correction)"}
        </button>
      )}
    </div>
  );
}
