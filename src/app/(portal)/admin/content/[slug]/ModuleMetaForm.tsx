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
}

export default function ModuleMetaForm(props: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await updateModuleMetaAction(props.moduleId, formData);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={props.published} />
        Published (visible to trainees)
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
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
      </div>
    </form>
  );
}
