"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signDocumentAction, type SignDocumentState } from "@/app/actions/signedDocuments";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Signing..." : "Sign & Continue"}
    </button>
  );
}

export default function SignDocumentForm({ documentId, defaultName }: { documentId: string; defaultName: string }) {
  const action = signDocumentAction.bind(null, documentId);
  const [state, formAction] = useFormState<SignDocumentState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Sign This Document</h2>
      <label className="mb-1 block text-xs font-medium text-neutral-700">Type your full legal name to sign</label>
      <input
        type="text"
        name="signedName"
        defaultValue={defaultName}
        required
        className="mb-4 w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <label className="mb-4 flex items-start gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="agreed" required className="mt-1 h-4 w-4" />
        <span>I have read and understand this document and agree to its terms.</span>
      </label>
      {state?.error && <p className="mb-4 text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
