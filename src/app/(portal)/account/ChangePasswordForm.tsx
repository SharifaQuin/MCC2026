"use client";

import { useFormState, useFormStatus } from "react-dom";
import { changeOwnPasswordAction, ChangePasswordState } from "@/app/actions/changePassword";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Change Password"}
    </button>
  );
}

export default function ChangePasswordForm() {
  const [state, formAction] = useFormState<ChangePasswordState, FormData>(
    changeOwnPasswordAction,
    {}
  );

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Current Password</label>
        <input
          type="password"
          name="currentPassword"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">New Password</label>
        <input
          type="password"
          name="newPassword"
          required
          minLength={8}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Confirm New Password</label>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700">Password updated.</p>}
      <SubmitButton />
    </form>
  );
}
