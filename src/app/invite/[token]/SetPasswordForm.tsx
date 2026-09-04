"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setPasswordAction, SetPasswordState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "..." : "Set Password & Log In"}
    </button>
  );
}

export default function SetPasswordForm({ token }: { token: string }) {
  const action = setPasswordAction.bind(null, token);
  const [state, formAction] = useFormState<SetPasswordState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">New Password</label>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Confirm Password</label>
        <input
          type="password"
          name="confirm"
          required
          minLength={8}
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
