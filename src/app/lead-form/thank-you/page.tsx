import { getAdConsentStatus } from "@/lib/consent";
import MetaPixel from "@/components/MetaPixel";
import ConsentControls from "@/components/ConsentControls";
import MetaPixelLeadEvent from "./MetaPixelLeadEvent";

export default function LeadThankYouPage() {
  const consent = getAdConsentStatus();

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <MetaPixel consent={consent} />
      <MetaPixelLeadEvent consent={consent} />
      <h1 className="text-2xl font-semibold text-neutral-900">
        Thank you for your interest in Mama&apos;s Cleaning Crew!
      </h1>
      <p className="mt-4 text-neutral-600">Someone will be in touch with you soon.</p>
      <ConsentControls consent={consent} />
    </div>
  );
}
