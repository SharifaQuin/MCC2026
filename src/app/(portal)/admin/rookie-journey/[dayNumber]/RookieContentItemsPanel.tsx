"use client";

import { useState, useTransition } from "react";
import {
  createRookieContentItemAction,
  updateRookieContentItemAction,
  deleteRookieContentItemAction,
  moveDaySequenceItemAction,
  type RookieContentItemFormInput,
} from "@/app/actions/rookieJourney";

type Kind = "PRACTICAL_LESSON" | "SCENARIO" | "RECAP" | "ORIENTATION";

export interface ContentItemRow {
  id: string;
  kind: Kind;
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  promptEn: string | null;
  promptEs: string | null;
  revealEn: string | null;
  revealEs: string | null;
  hasFutureVideoSlot: boolean;
  estimatedMinutes: number | null;
  sourceLessonIds: string[];
  sourceLessonLabels: string[];
}

export interface LessonOption {
  id: string;
  titleEn: string;
  moduleTitleEn: string;
}

const EMPTY_FORM: RookieContentItemFormInput = {
  kind: "PRACTICAL_LESSON",
  titleEn: "",
  titleEs: "",
  bodyEn: "",
  bodyEs: "",
  promptEn: "",
  promptEs: "",
  revealEn: "",
  revealEs: "",
  hasFutureVideoSlot: false,
  estimatedMinutes: undefined,
  sourceLessonIds: [],
};

function ContentForm({
  dayNumber,
  initial,
  editingId,
  lessons,
  onDone,
}: {
  dayNumber: number;
  initial: RookieContentItemFormInput;
  editingId: string | null;
  lessons: LessonOption[];
  onDone: () => void;
}) {
  const [form, setForm] = useState<RookieContentItemFormInput>(initial);
  const [pending, startTransition] = useTransition();
  const isScenario = form.kind === "SCENARIO";

  function field<K extends keyof RookieContentItemFormInput>(key: K, value: RookieContentItemFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleLesson(id: string) {
    setForm((f) => ({
      ...f,
      sourceLessonIds: f.sourceLessonIds.includes(id)
        ? f.sourceLessonIds.filter((x) => x !== id)
        : [...f.sourceLessonIds, id],
    }));
  }

  return (
    <div className="space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-neutral-700">
          Kind
          <select
            value={form.kind}
            onChange={(e) => field("kind", e.target.value as Kind)}
            className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
          >
            <option value="ORIENTATION">Orientation</option>
            <option value="PRACTICAL_LESSON">Practical Lesson</option>
            <option value="SCENARIO">Scenario</option>
            <option value="RECAP">Recap</option>
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-700">
          Estimated Minutes
          <input
            type="number"
            value={form.estimatedMinutes ?? ""}
            onChange={(e) => field("estimatedMinutes", e.target.value ? Number(e.target.value) : undefined)}
            className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm"
          />
        </label>
      </div>

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
              Prompt / "What would you do?" (EN)
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

      {!isScenario && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.hasFutureVideoSlot}
            onChange={(e) => field("hasFutureVideoSlot", e.target.checked)}
            className="h-4 w-4"
          />
          Reserve a future real-MCC-demonstration video slot for this card
        </label>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-neutral-700">Source lesson(s) this card condenses (traceability only)</p>
        <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 p-2">
          {lessons.map((l) => (
            <label key={l.id} className="flex items-center gap-2 py-0.5 text-xs">
              <input
                type="checkbox"
                checked={form.sourceLessonIds.includes(l.id)}
                onChange={() => toggleLesson(l.id)}
                className="h-3.5 w-3.5"
              />
              <span className="text-neutral-500">{l.moduleTitleEn} —</span> {l.titleEn}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !form.titleEn.trim()}
          onClick={() =>
            startTransition(async () => {
              if (editingId) {
                await updateRookieContentItemAction(editingId, form);
              } else {
                await createRookieContentItemAction(dayNumber, form);
              }
              onDone();
            })
          }
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : editingId ? "Save Card" : "Add Card"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function RookieContentItemsPanel({
  dayNumber,
  items,
  lessons,
}: {
  dayNumber: number;
  items: ContentItemRow[];
  lessons: LessonOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingItem = items.find((i) => i.id === editingId) ?? null;

  return (
    <div className="space-y-3">
      {items.length === 0 && !adding && (
        <p className="text-sm text-neutral-400">No condensed content cards on this day yet.</p>
      )}

      <ul className="space-y-2">
        {items.map((item, i) =>
          editingId === item.id ? (
            <li key={item.id}>
              <ContentForm
                dayNumber={dayNumber}
                editingId={item.id}
                lessons={lessons}
                initial={{
                  kind: item.kind,
                  titleEn: item.titleEn,
                  titleEs: item.titleEs,
                  bodyEn: item.bodyEn,
                  bodyEs: item.bodyEs,
                  promptEn: item.promptEn ?? "",
                  promptEs: item.promptEs ?? "",
                  revealEn: item.revealEn ?? "",
                  revealEs: item.revealEs ?? "",
                  hasFutureVideoSlot: item.hasFutureVideoSlot,
                  estimatedMinutes: item.estimatedMinutes ?? undefined,
                  sourceLessonIds: item.sourceLessonIds,
                }}
                onDone={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={item.id} className="rounded-md border border-neutral-200 p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <span className="mb-1 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                    {item.kind.replace("_", " ")}
                  </span>
                  <p className="text-sm font-medium text-neutral-900">{item.titleEn}</p>
                  {item.sourceLessonLabels.length > 0 && (
                    <p className="mt-0.5 text-xs text-neutral-400">Condensed from: {item.sourceLessonLabels.join(", ")}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={pending || i === 0}
                    onClick={() =>
                      startTransition(() => moveDaySequenceItemAction(dayNumber, { type: "CONTENT", id: item.id }, "up"))
                    }
                    className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || i === items.length - 1}
                    onClick={() =>
                      startTransition(() => moveDaySequenceItemAction(dayNumber, { type: "CONTENT", id: item.id }, "down"))
                    }
                    className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(item.id)}
                    className="ml-1 rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete "${item.titleEn}"? This cannot be undone.`)) {
                        startTransition(() => deleteRookieContentItemAction(item.id));
                      }
                    }}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          )
        )}
      </ul>

      {adding ? (
        <ContentForm dayNumber={dayNumber} editingId={null} lessons={lessons} initial={EMPTY_FORM} onDone={() => setAdding(false)} />
      ) : (
        !editingItem && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md border border-dashed border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            + Add Content Card
          </button>
        )
      )}
    </div>
  );
}
