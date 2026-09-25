"use client";

import { useTransition } from "react";
import { moveLessonAssignmentAction, setLessonAssignmentAction } from "@/app/actions/rookieJourney";

interface Row {
  assignmentId: string;
  lessonId: string;
  lessonTitleEn: string;
  moduleTitleEn: string;
}

export default function AssignedLessonsList({ lessons }: { lessons: Row[] }) {
  const [pending, startTransition] = useTransition();

  if (lessons.length === 0) {
    return <p className="text-sm text-neutral-400">No lessons assigned to this day yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {lessons.map((l, i) => (
        <li
          key={l.assignmentId}
          className="flex items-center justify-between rounded-md border border-neutral-200 p-3"
        >
          <div>
            <p className="text-sm font-medium text-neutral-900">{l.lessonTitleEn}</p>
            <p className="text-xs text-neutral-500">{l.moduleTitleEn}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pending || i === 0}
              onClick={() => startTransition(() => moveLessonAssignmentAction(l.assignmentId, "up"))}
              className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={pending || i === lessons.length - 1}
              onClick={() => startTransition(() => moveLessonAssignmentAction(l.assignmentId, "down"))}
              className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => setLessonAssignmentAction(l.lessonId, { dayNumber: null, slot: null }))
              }
              className="ml-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
