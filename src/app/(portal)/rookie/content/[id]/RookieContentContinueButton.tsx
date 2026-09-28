"use client";

import { completeRookieContentAndContinueAction } from "@/app/actions/rookieJourney";

export default function RookieContentContinueButton({
  contentItemId,
  nextHref,
  label,
}: {
  contentItemId: string;
  nextHref: string;
  label: string;
}) {
  const action = completeRookieContentAndContinueAction.bind(null, contentItemId, nextHref);
  return (
    <form action={action}>
      <button
        type="submit"
        className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        {label}
      </button>
    </form>
  );
}
