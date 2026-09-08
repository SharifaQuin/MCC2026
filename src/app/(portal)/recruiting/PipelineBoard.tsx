"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setApplicantStageAction } from "./applicants/actions";
import { PRIMARY_NEXT_STAGE } from "@/lib/recruiting";
import type { ApplicantStage } from "@prisma/client";

interface Card {
  id: string;
  firstName: string;
  lastName: string;
  jobPostingTitle: string;
  prescreenScore: number | null;
  prescreenMaxScore: number | null;
  stage: ApplicantStage;
}

function ApplicantCard({ applicant }: { applicant: Card }) {
  const [pending, startTransition] = useTransition();
  const primary = PRIMARY_NEXT_STAGE[applicant.stage];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <Link
        href={`/recruiting/applicants/${applicant.id}`}
        className="font-medium text-brand-700 hover:underline"
      >
        {applicant.firstName} {applicant.lastName}
      </Link>
      <p className="truncate text-xs text-neutral-500">{applicant.jobPostingTitle}</p>
      {applicant.prescreenScore !== null && (
        <p className="mt-1 text-xs text-neutral-400">
          Score: {applicant.prescreenScore}/{applicant.prescreenMaxScore}
        </p>
      )}
      {primary && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              setApplicantStageAction(applicant.id, primary.stage as ApplicantStage)
            )
          }
          className="mt-2 w-full rounded-md bg-brand-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Moving..." : `→ ${primary.label}`}
        </button>
      )}
    </div>
  );
}

export default function PipelineBoard({
  columns,
}: {
  columns: { stage: string; label: string; applicants: Card[] }[];
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.stage} className="w-64 shrink-0">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-neutral-700">{col.label}</h3>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
              {col.applicants.length}
            </span>
          </div>
          <div className="space-y-2">
            {col.applicants.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 p-3 text-center text-xs text-neutral-400">
                Empty
              </p>
            ) : (
              col.applicants.map((a) => <ApplicantCard key={a.id} applicant={a} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
