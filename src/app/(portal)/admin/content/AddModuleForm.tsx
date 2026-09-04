"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createModuleAction } from "./actions";

export default function AddModuleForm() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          const slug = await createModuleAction(formData);
          formRef.current?.reset();
          if (slug) router.push(`/admin/content/${slug}`);
        });
      }}
      className="flex gap-2"
    >
      <input
        name="titleEn"
        placeholder="New module title (English)"
        required
        className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "..." : "Add Module"}
      </button>
    </form>
  );
}
