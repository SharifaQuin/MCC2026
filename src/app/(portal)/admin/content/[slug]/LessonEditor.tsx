"use client";

import { useState, useTransition } from "react";
import { updateLessonAction, deleteLessonAction, createLessonAction } from "../actions";

interface Lesson {
  id: string;
  order: number;
  titleEn: string;
  titleEs: string | null;
  contentEn: string;
  contentEs: string | null;
  videoUrl: string | null;
}

function LessonRow({ lesson, slug }: { lesson: Lesson; slug: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-medium">
          {lesson.order}. {lesson.titleEn}
        </span>
        <span className="text-xs text-neutral-400">{open ? "Hide" : "Edit"}</span>
      </button>

      {open && (
        <form
          action={(formData) => startTransition(() => updateLessonAction(lesson.id, slug, formData))}
          className="mt-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Title (English)</label>
              <input
                name="titleEn"
                defaultValue={lesson.titleEn}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Title (Español)</label>
              <input
                name="titleEs"
                defaultValue={lesson.titleEs ?? ""}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Content (English)</label>
              <textarea
                name="contentEn"
                defaultValue={lesson.contentEn}
                rows={5}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Content (Español)</label>
              <textarea
                name="contentEs"
                defaultValue={lesson.contentEs ?? ""}
                rows={5}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Video URL (embed link)</label>
            <input
              name="videoUrl"
              defaultValue={lesson.videoUrl ?? ""}
              placeholder="Paste YouTube embed link once uploaded"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save Lesson"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this lesson?")) {
                  startTransition(() => deleteLessonAction(lesson.id, slug));
                }
              }}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LessonEditor({
  moduleId,
  slug,
  lessons,
}: {
  moduleId: string;
  slug: string;
  lessons: Lesson[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {lessons.map((lesson) => (
        <LessonRow key={lesson.id} lesson={lesson} slug={slug} />
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => createLessonAction(moduleId, slug))}
        className="w-full rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand-400 hover:text-brand-600"
      >
        + Add Lesson
      </button>
    </div>
  );
}
