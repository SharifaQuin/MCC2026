"use client";

import { useRef } from "react";
import { addFieldSkillAction } from "@/app/actions/rookieJourney";

export default function AddFieldSkillForm() {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await addFieldSkillAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Label (English)</label>
        <input name="labelEn" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Label (Español)</label>
        <input name="labelEs" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <button
        type="submit"
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        + Add Field Skill
      </button>
    </form>
  );
}
