"use client";

import { useMemo, useState, useTransition } from "react";
import { setLessonAssignmentAction } from "@/app/actions/rookieJourney";

interface LessonOption {
  id: string;
  titleEn: string;
  moduleTitleEn: string;
  moduleOrder: number;
  order: number;
  assignment: { id: string; slot: "ROOKIE_DAY" | "KNOWLEDGE_LIBRARY"; dayNumber: number | null } | null;
}

const DAY_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

function currentValue(a: LessonOption["assignment"]) {
  if (!a) return "unassigned";
  if (a.slot === "KNOWLEDGE_LIBRARY") return "library";
  return `day-${a.dayNumber}`;
}

function AssignRow({ lesson }: { lesson: LessonOption }) {
  const [value, setValue] = useState(currentValue(lesson.assignment));
  const [pending, startTransition] = useTransition();

  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <td className="px-4 py-2">
        <p className="text-sm font-medium text-neutral-900">{lesson.titleEn}</p>
        <p className="text-xs text-neutral-500">{lesson.moduleTitleEn}</p>
      </td>
      <td className="px-4 py-2">
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            startTransition(() => {
              if (next === "unassigned") {
                void setLessonAssignmentAction(lesson.id, { dayNumber: null, slot: null });
              } else if (next === "library") {
                void setLessonAssignmentAction(lesson.id, { dayNumber: null, slot: "KNOWLEDGE_LIBRARY" });
              } else {
                const dayNumber = Number(next.replace("day-", ""));
                void setLessonAssignmentAction(lesson.id, { dayNumber, slot: "ROOKIE_DAY" });
              }
            });
          }}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-60"
        >
          <option value="unassigned">Unassigned</option>
          <option value="library">Knowledge Library</option>
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={`day-${d}`}>
              Rookie Day {d}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

export default function LessonAssignmentTable({ lessons }: { lessons: LessonOption[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter(
      (l) => l.titleEn.toLowerCase().includes(q) || l.moduleTitleEn.toLowerCase().includes(q)
    );
  }, [lessons, query]);

  return (
    <div>
      <input
        type="search"
        placeholder="Search lessons or modules..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3 w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <div className="max-h-[70vh] overflow-y-auto overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Lesson</th>
              <th className="px-4 py-3">Assignment</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <AssignRow key={l.id} lesson={l} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-neutral-500">
                  No lessons match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
