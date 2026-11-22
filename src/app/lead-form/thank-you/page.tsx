import { cookies } from "next/headers";
import MetaPixel from "@/components/MetaPixel";
import MetaPixelLeadEvent from "./MetaPixelLeadEvent";

export default function LeadThankYouPage() {
  const leadId = cookies().get("mcc_last_lead_id")?.value ?? "";

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <MetaPixel />
      {leadId && <MetaPixelLeadEvent leadId={leadId} />}
      <h1 className="text-2xl font-semibold text-neutral-900">
        Thank you for your interest in Mama&apos;s Cleaning Crew!
      </h1>
      <p className="mt-4 text-neutral-600">Someone will be in touch with you soon.</p>
    </div>
  );
}
