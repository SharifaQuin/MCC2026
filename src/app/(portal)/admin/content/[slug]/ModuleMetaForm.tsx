"use client";

import { useTransition, useState } from "react";
import { updateModuleMetaAction, deleteModuleAction } from "../actions";
import { useRouter } from "next/navigation";

interface Props {
  moduleId: string;
  titleEn: string;
  titleEs: string | null;
  summaryEn: string | null;
  summaryEs: string | null;
  published: boolean;
  updatedAt: string;
  // False for a permitted-but-non-admin training content editor: hides
  // publish/unpublish and delete, which stay ADMIN-only even though the
  // same component and save action are reused for both viewers.
  canAdminister: boolean;
}

export default function ModuleMetaForm(props: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateModuleMetaAction(props.moduleId, props.updatedAt, formData);
          if (result.ok) {
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          } else {
            setError(result.error ?? "Could not save.");
          }
        });
      }}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Title (English)</label>
          <input
            name="titleEn"
            defaultValue={props.titleEn}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Title (Español)</label>
          <input
            name="titleEs"
            defaultValue={props.titleEs ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Summary (English)</label>
          <textarea
            name="summaryEn"
            defaultValue={props.summaryEn ?? ""}
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Summary (Español)</label>
          <textarea
            name="summaryEs"
            defaultValue={props.summaryEs ?? ""}
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {props.canAdminister && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={props.published} />
          Published (visible to trainees)
        </label>
      )}
      {!props.canAdminister && (
        <p className="text-xs text-amber-700">
          Saving here changes published content immediately — there is no draft or approval step.
        </p>
      )}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
        {props.canAdminister && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this entire module, including all lessons and quiz questions?")) {
                startTransition(async () => {
                  await deleteModuleAction(props.moduleId);
                  router.push("/admin/content");
                });
              }
            }}
            className="text-sm font-medium text-red-600 hover:underline"
          >
            Delete Module
          </button>
        )}
      </div>
    </form>
  );
}
