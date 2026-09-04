"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { resetPasswordAction, setAccountActiveAction, ResetPasswordState } from "@/app/actions/account";

function ResetButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-60"
    >
      {pending ? "..." : "Reset Password"}
    </button>
  );
}

export default function AccountManagement({
  userId,
  active,
  mustSetPassword,
}: {
  userId: string;
  active: boolean;
  mustSetPassword: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const action = resetPasswordAction.bind(null, userId);
  const [state, formAction] = useFormState<ResetPasswordState, FormData>(action, {});

  const statusLabel = !active ? "Deactivated" : mustSetPassword ? "Invite Pending" : "Active";
  const statusColor = !active
    ? "bg-red-100 text-red-700"
    : mustSetPassword
      ? "bg-amber-100 text-amber-700"
      : "bg-green-100 text-green-700";

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-medium">Account</p>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={formAction}>
          <ResetButton />
        </form>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const verb = active ? "deactivate" : "reactivate";
            if (confirm(`Are you sure you want to ${verb} this account?`)) {
              startTransition(() => setAccountActiveAction(userId, !active));
            }
          }}
          className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${
            active
              ? "bg-red-50 text-red-700 hover:bg-red-100"
              : "bg-green-50 text-green-700 hover:bg-green-100"
          }`}
        >
          {pending ? "..." : active ? "Deactivate Account" : "Reactivate Account"}
        </button>
      </div>

      {state?.inviteUrl && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          <p className="mb-2 font-medium text-green-800">
            New password link created. Send this to the employee — their old password no longer
            works until they use it:
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
