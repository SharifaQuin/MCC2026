"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ds/Button";
import type { QualificationChecklistItem, ApplicationResponseItem } from "@/lib/recruiting";
import type { InterviewFormat } from "@prisma/client";

export interface EligibleInterviewerOption {
  id: string;
  name: string;
  supportsZoom: boolean;
  supportsInPerson: boolean;
}

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
// Schedule Zoom Interview, Full Profile, and Pass stay full-width and
// always visible — never behind an overflow menu. The self-schedule invite
// (the only way to reach this applicant before Office Assistant direct
// booking existed) stays one tap away as a clearly labeled secondary link,
// not a fourth equal-weight button.
export default function ApplicantQuickCard({
  applicant,
  interviewers,
  onBook,
  onInvite,
  onPass,
}: {
  applicant: ApplicantQuickCardData;
  interviewers: EligibleInterviewerOption[];
  onBook: (applicantId: string, scheduledAtLocal: string) => Promise<{ scheduledAt: string }>;
  onInvite: (applicantId: string, interviewerId: string, format: InterviewFormat) => Promise<void>;
  onPass: (applicantId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"invite" | "pass" | "book" | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteInterviewerId, setInviteInterviewerId] = useState(interviewers[0]?.id ?? "");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const selectedInterviewer = interviewers.find((i) => i.id === inviteInterviewerId);
  const inviteFormatOptions: InterviewFormat[] = selectedInterviewer
    ? [
        ...(selectedInterviewer.supportsZoom ? (["ZOOM"] as const) : []),
        ...(selectedInterviewer.supportsInPerson ? (["IN_PERSON"] as const) : []),
      ]
    : [];
  const [inviteFormat, setInviteFormat] = useState<InterviewFormat | "">(inviteFormatOptions[0] ?? "");
  const failedRequired = applicant.requirements.filter((r) => !r.met).length;

  function handleInviteSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!inviteInterviewerId || !inviteFormat) {
      setInviteError("Please choose an interviewer and format.");
      return;
    }
    setInviteError(null);
    setAction("invite");
    startTransition(async () => {
      try {
        await onInvite(applicant.id, inviteInterviewerId, inviteFormat as InterviewFormat);
        setInviting(false);
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : "Couldn't send the invite.");
      }
    });
  }

  function handleBookSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = String(formData.get("date") ?? "");
    const time = String(formData.get("time") ?? "");
    if (!date || !time) return;
    setBookError(null);
    setAction("book");
    startTransition(async () => {
      try {
        await onBook(applicant.id, `${date}T${time}`);
        // The card is about to disappear from this list the moment the
        // booking revalidates it (the applicant is no longer
        // PRESCREEN_PASSED), so there's no good way to show a confirmation
        // in place here — send Pedro straight to the profile instead, where
        // the existing "Phone/Zoom Interview Scheduled: ... PT" banner
        // already confirms the booked date/time, and the Communication tab
        // is one click away for Shar to send the Zoom confirmation from.
        router.push(`/recruiting/applicants/${applicant.id}?tab=comms`);
      } catch (err) {
        setBookError(err instanceof Error ? err.message : "Couldn't book the interview.");
      }
    });
  }

  return (
    <div
      data-testid={`applicant-quick-card-${applicant.id}`}
      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5"
    >
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

      {scheduling && (
        <form
          onSubmit={handleBookSubmit}
          className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3"
        >
          <label className="mb-1 block text-xs font-medium text-brand-800">
            Agreed date/time for the Zoom interview{" "}
            <span className="font-normal text-neutral-500">(Pacific Time)</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              name="date"
              required
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              type="time"
              name="time"
              required
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <Button type="submit" size="md" disabled={pending}>
              {pending && action === "book" ? "Booking…" : "Book"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setScheduling(false);
                setBookError(null);
              }}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
          {bookError && <p className="mt-2 text-xs font-medium text-red-700">{bookError}</p>}
        </form>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() => setScheduling((s) => !s)}
        >
          Schedule Zoom Interview
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

      {inviting ? (
        <form
          onSubmit={handleInviteSubmit}
          className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
        >
          <p className="text-xs font-medium text-neutral-700">
            Candidate picks their own time from this interviewer&apos;s open slots
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              value={inviteInterviewerId}
              onChange={(e) => {
                setInviteInterviewerId(e.target.value);
                const next = interviewers.find((i) => i.id === e.target.value);
                const nextFormats: InterviewFormat[] = next
                  ? [
                      ...(next.supportsZoom ? (["ZOOM"] as const) : []),
                      ...(next.supportsInPerson ? (["IN_PERSON"] as const) : []),
                    ]
                  : [];
                setInviteFormat(nextFormats[0] ?? "");
              }}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {interviewers.length === 0 && <option value="">No interviewers configured yet</option>}
              {interviewers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <select
              value={inviteFormat}
              onChange={(e) => setInviteFormat(e.target.value as InterviewFormat)}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {inviteFormatOptions.length === 0 && <option value="">—</option>}
              {inviteFormatOptions.map((f) => (
                <option key={f} value={f}>
                  {f === "ZOOM" ? "Zoom" : "In-Person"}
                </option>
              ))}
            </select>
            <Button type="submit" size="md" disabled={pending || !inviteInterviewerId || !inviteFormat}>
              {pending && action === "invite" ? "Sending…" : "Send Invite"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setInviting(false);
                setInviteError(null);
              }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
          {inviteError && <p className="text-xs font-medium text-red-700">{inviteError}</p>}
        </form>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setInviting(true)}
          className="mt-2 w-full text-center text-xs font-medium text-neutral-500 underline hover:text-neutral-700 disabled:opacity-60"
        >
          Or send a self-schedule invite instead (candidate picks their own time)
        </button>
      )}
    </div>
  );
}
