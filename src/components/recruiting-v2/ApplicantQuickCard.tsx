"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Button from "@/components/ds/Button";
import type { QualificationChecklistItem, ApplicationResponseItem } from "@/lib/recruiting";

export interface ApplicantQuickCardData {
  id: string;
  name: string;
  appliedAgo: string;
  city: string | null;
  experienceSummary: string | null;
  additionalExperience: string[];
  requirements: QualificationChecklistItem[];
  writtenResponses: ApplicationResponseItem[];
  preferredIndicators: string[];
  howHeard: string | null;
  continuedInterest: boolean | null;
}

const RESPONSE_PREVIEW_CHARS = 140;

function ResponseCard({ item }: { item: ApplicationResponseItem }) {
  const [expanded, setExpanded] = useState(false);
  const text = item.text ?? "";
  const isLong = text.length > RESPONSE_PREVIEW_CHARS;
  const shown = expanded || !isLong ? text : `${text.slice(0, RESPONSE_PREVIEW_CHARS)}…`;

  return (
    <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{item.label}</p>
      {item.selectedOption && (
        <p className="mt-1 text-sm font-medium text-brand-700">{item.selectedOption}</p>
      )}
      {text && (
        <>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{shown}</p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-brand-600 hover:underline"
            >
              {expanded ? "Show less" : "Read More"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// The single highest-priority screen in Recruiting 2.0 — Shar needs to
// understand a candidate in ~10-20 seconds from her phone, mid-shift, in
// the candidate's own words (never an AI summary or a hidden score).
// Invite, Full Profile, and Pass stay full-width and always visible —
// never behind an overflow menu.
export default function ApplicantQuickCard({
  applicant,
  onInvite,
  onPass,
}: {
  applicant: ApplicantQuickCardData;
  onInvite: (applicantId: string) => Promise<void>;
  onPass: (applicantId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"invite" | "pass" | null>(null);
  const failedRequired = applicant.requirements.filter((r) => !r.met).length;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-brand-800">{applicant.name}</p>
          <p className="text-xs text-neutral-500">
            Applied {applicant.appliedAgo}
            {applicant.city ? ` · ${applicant.city}` : ""}
          </p>
          {applicant.experienceSummary && (
            <p className="mt-0.5 text-sm font-medium text-brand-600">{applicant.experienceSummary}</p>
          )}
          {applicant.additionalExperience.length > 0 && (
            <p className="mt-0.5 text-xs text-neutral-500">
              Additional experience: {applicant.additionalExperience.join(" • ")}
            </p>
          )}
        </div>
        {failedRequired > 0 && (
          <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
            {failedRequired} requirement{failedRequired === 1 ? "" : "s"} not met
          </span>
        )}
      </div>

      {applicant.requirements.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {applicant.requirements.map((r, i) => (
            <li key={i} className={r.met ? "text-neutral-700" : "font-medium text-red-700"}>
              {r.met ? "✓" : "✗"} {r.label}
            </li>
          ))}
        </ul>
      )}

      {applicant.preferredIndicators.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {applicant.preferredIndicators.map((p, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full bg-gold-100 px-2.5 py-1 text-xs font-medium text-gold-700"
            >
              ★ {p}
            </span>
          ))}
        </div>
      )}

      {applicant.continuedInterest === false && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Said they may not still be interested after reading the realistic job preview.
        </p>
      )}

      {applicant.howHeard && (
        <p className="mt-3 text-xs text-neutral-500">Heard about us via: {applicant.howHeard}</p>
      )}

      {applicant.writtenResponses.length > 0 && (
        <div className="mt-3 space-y-2">
          {applicant.writtenResponses.map((item, i) => (
            <ResponseCard key={i} item={item} />
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() => {
            setAction("invite");
            startTransition(() => onInvite(applicant.id));
          }}
        >
          {pending && action === "invite" ? "Sending…" : "Invite to Interview"}
        </Button>
        <Link
          href={`/recruiting/applicants/${applicant.id}`}
          className="flex w-full items-center justify-center rounded-lg border border-brand-200 px-4 py-3.5 text-base font-semibold text-brand-700 transition hover:bg-brand-50"
        >
          Full Profile
        </Link>
        <Button
          variant="danger"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() => {
            setAction("pass");
            startTransition(() => onPass(applicant.id));
          }}
        >
          {pending && action === "pass" ? "Passing…" : "Pass"}
        </Button>
      </div>
    </div>
  );
}
