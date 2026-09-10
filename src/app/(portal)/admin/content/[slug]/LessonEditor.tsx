"use client";

import { useState, useTransition } from "react";
import { updateLessonAction, deleteLessonAction, createLessonAction } from "../actions";
import { fileToResizedDataUrl } from "@/lib/imageResize";

interface Lesson {
  id: string;
  order: number;
  titleEn: string;
  titleEs: string | null;
  contentEn: string;
  contentEs: string | null;
  videoUrl: string | null;
  videoTranscriptEn: string | null;
  videoTranscriptEs: string | null;
  videoDurationSeconds: number | null;
  imageUrl: string | null;
  estimatedMinutes: number | null;
  published: boolean;
}

function LessonRow({ lesson, slug }: { lesson: Lesson; slug: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [imageUrl, setImageUrl] = useState(lesson.imageUrl ?? "");
  const [imageError, setImageError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 font-medium">
          {lesson.order}. {lesson.titleEn}
          {!lesson.published && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
              Unpublished
            </span>
          )}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Video URL (embed link)</label>
              <input
                key={lesson.videoUrl ?? ""}
                name="videoUrl"
                defaultValue={lesson.videoUrl ?? ""}
                placeholder="e.g. https://share.synthesia.io/embeds/videos/..."
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-neutral-400">
                Paste the share link or the full embed code Synthesia, YouTube, Vimeo, or Loom
                gives you — this field auto-converts the common share/watch link into its
                embeddable form, and pulls the link out of a pasted{" "}
                <code>&lt;iframe&gt;</code> snippet automatically. Save the lesson, then reopen
                it to confirm the link changed if it needed fixing.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Video length (seconds)
              </label>
              <input
                type="number"
                min={0}
                name="videoDurationSeconds"
                defaultValue={lesson.videoDurationSeconds ?? ""}
                placeholder="e.g. 90"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-neutral-400">
                Trainees can&apos;t continue past this lesson until this much time has passed.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">
                Video transcript (English)
              </label>
              <textarea
                name="videoTranscriptEn"
                defaultValue={lesson.videoTranscriptEn ?? ""}
                rows={5}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Video transcript (Español)
              </label>
              <textarea
                name="videoTranscriptEs"
                defaultValue={lesson.videoTranscriptEs ?? ""}
                rows={5}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <p className="col-span-2 -mt-1 text-xs text-neutral-400">
              Since the video itself has no Spanish audio or captions, a Spanish transcript
              shown below the video is the way Spanish-speaking trainees get its content.
              Optional, but recommended for every lesson with a video.
            </p>
          </div>
          <div>
            <label className="mb-1 block w-40 text-xs font-medium">
              Estimated time (minutes)
            </label>
            <input
              type="number"
              min={0}
              name="estimatedMinutes"
              defaultValue={lesson.estimatedMinutes ?? ""}
              placeholder="e.g. 5"
              className="w-40 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Shown to trainees so they know how long this lesson takes. Optional.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Photo (optional)</label>
            <input type="hidden" name="imageUrl" value={imageUrl} />
            {imageUrl && (
              <div className="mb-2 flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  className="h-24 w-auto rounded-md border border-neutral-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove photo
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImageError(null);
                try {
                  setImageUrl(await fileToResizedDataUrl(file));
                } catch {
                  setImageError("Couldn't read that image — try a different file.");
                }
              }}
              className="block w-full text-sm"
            />
            {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
            <p className="mt-1 text-xs text-neutral-400">
              Shown above the lesson text (below the video, if this lesson has one).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="published"
              defaultChecked={lesson.published}
              className="h-4 w-4"
            />
            Published (visible to trainees)
          </label>
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
