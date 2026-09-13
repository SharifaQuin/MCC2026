"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { inviteAction, InviteState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "..." : "Create Invite"}
    </button>
  );
}

export default function InviteForm() {
  const [state, formAction] = useFormState<InviteState, FormData>(inviteAction, {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="max-w-md space-y-6">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Full Name</label>
          <input
            name="name"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Role</label>
          <select name="role" className="w-full rounded-md border border-neutral-300 px-3 py-2">
            <option value="TRAINEE">Trainee</option>
            <option value="TRAINER">Trainer / Field Supervisor</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sendInviteNow" defaultChecked className="h-4 w-4" />
          Send the invite link now (uncheck to just add them to the roster and invite later)
        </label>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton />
      </form>

      {state?.addedWithoutInvite && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Added to the roster. They can&apos;t log in yet — use &quot;Send Invite&quot; on their
          profile whenever you&apos;re ready.
        </div>
      )}

      {state?.inviteUrl && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm">
          <p className="mb-2 font-medium text-green-800">
            Invite created. Send this link to the employee — they&apos;ll use it to set their password:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs">
              {state.inviteUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(state.inviteUrl!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded bg-neutral-800 px-3 py-1 text-xs font-medium text-white"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
