"use client";

import { useState, useTransition } from "react";
import { sendHrDigestNowAction } from "@/app/actions/hrDigest";

export default function SendHrDigestButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await sendHrDigestNowAction();
            if (result.error) setMessage(result.error);
            else if (result.sentCount === 0) setMessage("Nothing to report right now.");
            else setMessage("Sent to Slack.");
          });
        }}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Sending..." : "Send Digest to Slack Now"}
      </button>
      {message && <span className="text-xs text-neutral-500">{message}</span>}
    </div>
  );
}
