"use client";

import { useState, useTransition } from "react";
import { updateRookieContentItemAction } from "@/app/actions/rookieJourney";

// Text-only editor for one RookieContentItem card — reused by both ADMIN
// and a permitted non-admin editor (the save action itself force-preserves
// kind/sourceLessonIds/hasFutureVideoSlot/estimatedMinutes for a non-admin
// caller even though this form never offers changing them either way).
// Creating, deleting, reordering, re-kinding, or re-citing source lessons
// stays exclusively on /admin/rookie-journey — not duplicated here.
export interface EditableRookieContentItem {
  id: string;
  updatedAt: string;
  kind: "PRACTICAL_LESSON" | "SCENARIO" | "RECAP" | "ORIENTATION";
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  promptEn: string | null;
  promptEs: string | null;
  revealEn: string | null;
  revealEs: string | null;
  hasFutureVideoSlot: boolean;
  videoUrl: string | null;
  videoUrlEs: string | null;
  estimatedMinutes: number | null;
  sourceLessonIds: string[];
}

export default function RookieContentCardTextEditor({ item }: { item: EditableRookieContentItem }) {
  const [form, setForm] = useState({
    titleEn: item.titleEn,
    titleEs: item.titleEs,
    bodyEn: item.bodyEn,
    bodyEs: item.bodyEs,
    promptEn: item.promptEn ?? "",
    promptEs: item.promptEs ?? "",
    revealEn: item.revealEn ?? "",
    revealEs: item.revealEs ?? "",
    videoUrl: item.videoUrl ?? "",
    videoUrlEs: item.videoUrlEs ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isScenario = item.kind === "SCENARIO";

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div data-testid={`rookie-content-card-${item.id}`} className="space-y-3 rounded-md border border-neutral-200 p-4">
      <span className="inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
        {item.kind.replace("_", " ")}
      </span>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-neutral-700">
          Title (EN)
          <input
            value={form.titleEn}
            onChange={(e) => field("titleEn", e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-neutral-700">
          Title (ES)
          <input
            value={form.titleEs}
            onChange={(e) => field("titleEs", e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
          />
        </label>
      </div>

      {isScenario ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-neutral-700">
              Prompt / &quot;What would you do?&quot; (EN)
              <textarea
                value={form.promptEn}
                onChange={(e) => field("promptEn", e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Prompt (ES)
              <textarea
                value={form.promptEs}
                onChange={(e) => field("promptEs", e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-neutral-700">
              Reveal / What to do (EN)
              <textarea
                value={form.revealEn}
                onChange={(e) => field("revealEn", e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Reveal (ES)
              <textarea
                value={form.revealEs}
                onChange={(e) => field("revealEs", e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
              />
            </label>
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-neutral-700">
            Body (EN)
            <textarea
              value={form.bodyEn}
              onChange={(e) => field("bodyEn", e.target.value)}
              rows={8}
              className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Body (ES)
            <textarea
              value={form.bodyEs}
              onChange={(e) => field("bodyEs", e.target.value)}
              rows={8}
              className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
            />
          </label>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-neutral-700">
          Video URL (EN)
          <input
            value={form.videoUrl}
            onChange={(e) => field("videoUrl", e.target.value)}
            placeholder="https://share.synthesia.io/embeds/videos/..."
            className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-neutral-700">
          Video URL (ES)
          <input
            value={form.videoUrlEs}
            onChange={(e) => field("videoUrlEs", e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
          />
        </label>
      </div>

      <p className="text-xs text-amber-700">
        Saving here changes published content immediately — there is no draft or approval step.
      </p>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await updateRookieContentItemAction(item.id, item.updatedAt, {
              kind: item.kind,
              titleEn: form.titleEn,
              titleEs: form.titleEs,
              bodyEn: form.bodyEn,
              bodyEs: form.bodyEs,
              promptEn: form.promptEn,
              promptEs: form.promptEs,
              revealEn: form.revealEn,
              revealEs: form.revealEs,
              hasFutureVideoSlot: item.hasFutureVideoSlot,
              videoUrl: form.videoUrl,
              videoUrlEs: form.videoUrlEs,
              estimatedMinutes: item.estimatedMinutes ?? undefined,
              sourceLessonIds: item.sourceLessonIds,
            });
            if (!result.ok) {
              setError(result.error ?? "Could not save.");
              return;
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          })
        }
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving..." : saved ? "Saved" : "Save Card"}
      </button>
    </div>
  );
}
