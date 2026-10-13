"use client";

import { useState, useTransition } from "react";
import {
  addLeadNoteAction,
  setLeadStageAction,
  setLeadDealDetailsAction,
  setLeadLanguageNoteAction,
} from "./actions";
import type { LeadStage } from "@prisma/client";

export default function OfficeAssistantLeadCallLogForm({
  leadId,
  stage,
  languageNote,
  followUpDueAt,
  canEdit,
}: {
  leadId: string;
  stage: LeadStage;
  languageNote: string | null;
  followUpDueAt: string | null;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [languageDraft, setLanguageDraft] = useState(languageNote ?? "");
  const [followUpDraft, setFollowUpDraft] = useState(followUpDueAt ? followUpDueAt.slice(0, 10) : "");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  if (!canEdit) {
    return <p className="text-sm text-neutral-500">View access only — you can&apos;t log calls here.</p>;
  }

  function markContacted() {
    startTransition(() => setLeadStageAction(leadId, "CONTACTED" as LeadStage));
  }

  function saveNote() {
    if (!note.trim()) return;
    const formData = new FormData();
    formData.set("body", note);
    startTransition(async () => {
      await addLeadNoteAction(leadId, formData);
      setNote("");
      setSavedMsg("Note saved.");
    });
  }

  function saveFollowUp() {
    const formData = new FormData();
    formData.set("followUpDate", followUpDraft);
    startTransition(async () => {
      await setLeadDealDetailsAction(leadId, formData);
      setSavedMsg("Follow-up date saved.");
    });
  }

  function saveLanguageNote() {
    startTransition(async () => {
      await setLeadLanguageNoteAction(leadId, languageDraft);
      setSavedMsg("Language note saved.");
    });
  }

  return (
    <div className="space-y-4">
      {stage === "NEW_INQUIRY" && (
        <button
          type="button"
          disabled={pending}
          onClick={markContacted}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Mark Contacted
        </button>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Call notes</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="What was discussed, outcome, etc."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={saveNote}
          className="mt-2 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          Save Note
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Next follow-up</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={followUpDraft}
              onChange={(e) => setFollowUpDraft(e.target.value)}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={pending}
              onClick={saveFollowUp}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Language evidence / confidence</label>
          <div className="flex gap-2">
            <input
              value={languageDraft}
              onChange={(e) => setLanguageDraft(e.target.value)}
              placeholder="e.g. Spoke Spanish, confirmed fluent"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={pending}
              onClick={saveLanguageNote}
              className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {savedMsg && <p className="text-xs text-green-700">{savedMsg}</p>}
    </div>
  );
}
