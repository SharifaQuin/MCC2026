"use client";

import { useFormState, useFormStatus } from "react-dom";
import { runPartTimeHouseCleanerFixAction, type RunPartTimeHouseCleanerFixState } from "../../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
    >
      {pending ? "Running..." : "Run one-time fix"}
    </button>
  );
}

// Only ever rendered for the one specific posting this targets, and only
// while it's still broken — see isPartTimeHouseCleanerFixNeeded in
// src/lib/recruiting.ts and its call site in page.tsx. Runs with a single
// click, no script or production database access needed.
export default function PartTimeHouseCleanerFixBanner() {
  const [state, formAction] = useFormState<RunPartTimeHouseCleanerFixState, FormData>(
    runPartTimeHouseCleanerFixAction,
    {}
  );

  if (state.success) {
    return (
      <div className="mb-6 rounded-lg border border-green-300 bg-green-50 p-4">
        <p className="font-medium text-green-800">{state.success}</p>
        <p className="mt-1 text-sm text-green-700">
          Refresh this page to see the updated prescreening questions below.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="font-medium text-amber-800">This posting&apos;s application is broken</p>
      <p className="mt-1 text-sm text-amber-700">
        Every prescreening question here is missing a step, so the application form shows &ldquo;Step 1 of
        0&rdquo; and can never be completed. This one-time fix replaces them with a corrected copy of the
        Cleaning Technician posting&apos;s questions, adjusted for a part-time, no-experience role.
      </p>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      <form action={formAction}>
        <SubmitButton />
      </form>
    </div>
  );
}
