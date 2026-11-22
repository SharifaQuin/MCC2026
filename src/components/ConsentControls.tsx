"use client";

import { useState } from "react";
import ConsentBanner from "@/components/ConsentBanner";
import type { AdConsentStatus } from "@/lib/consent";

// Shows the consent banner automatically while unanswered, and otherwise
// renders a small link that reopens it — so a visitor who already accepted
// or declined can still come back and change their mind at any time.
export default function ConsentControls({ consent }: { consent: AdConsentStatus }) {
  const [reopened, setReopened] = useState(false);

  if (consent === "unset" || reopened) {
    return <ConsentBanner onDismiss={() => setReopened(false)} />;
  }

  return (
    <button
      type="button"
      onClick={() => setReopened(true)}
      className="mt-6 block text-xs text-neutral-400 underline hover:text-neutral-600"
    >
      Ad-tracking preferences
    </button>
  );
}
