import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Plain route handler (not a Server Action) so it can be called from a
// client component with a simple fetch, independent of any form
// submission. Called once by the thank-you page's MetaPixelLeadEvent on
// mount — reads the short-lived mcc_last_lead_id cookie submitLeadAction
// sets ONLY on a genuine new-lead-created submission, then deletes it in
// the same response, so it can never be read twice. A reload of the
// thank-you page (or any other later request) finds the cookie already
// gone and gets leadId: null back — no Lead event fires a second time for
// the same submission, no matter how many times the page is reloaded.
export async function POST() {
  const leadId = cookies().get("mcc_last_lead_id")?.value ?? null;
  if (leadId) {
    cookies().delete({ name: "mcc_last_lead_id", path: "/lead-form" });
  }
  return NextResponse.json({ leadId });
}
