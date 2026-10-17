import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

export default async function SalesPricingToolPage({
  searchParams,
}: {
  searchParams: Promise<{
    quote?: string;
    leadName?: string;
    leadEmail?: string;
    leadPhone?: string;
    leadAddress?: string;
    leadZip?: string;
    leadService?: string;
    leadSqft?: string;
  }>;
}) {
  await requireDepartmentAccess("SALES");
  const { quote, leadName, leadEmail, leadPhone, leadAddress, leadZip, leadService, leadSqft } = await searchParams;

  const query = new URLSearchParams();
  if (quote) query.set("quote", quote);
  if (leadName) query.set("leadName", leadName);
  if (leadEmail) query.set("leadEmail", leadEmail);
  if (leadPhone) query.set("leadPhone", leadPhone);
  if (leadAddress) query.set("leadAddress", leadAddress);
  if (leadZip) query.set("leadZip", leadZip);
  if (leadService) query.set("leadService", leadService);
  if (leadSqft) query.set("leadSqft", leadSqft);
  const qs = query.toString();
  const src = `/api/sales/pricing-tool${qs ? `?${qs}` : ""}`;

  return (
    <div>
      <Link href="/sales" className="text-sm text-brand-700 hover:underline">
        ← Back to Sales
      </Link>

      {/* Previously broke out to the full browser width via `w-screen
          ml-[calc(-50vw+50%)]`, assuming the page's own column was centered
          in the viewport. That stopped being true once the portal layout
          added a persistent sidebar (src/app/(portal)/layout.tsx) — the
          content column is no longer centered, so that fixed-viewport-width
          box rendered partly underneath the sidebar and ran past the right
          edge of the screen. Filling the normal content column instead
          (same as any other page) keeps the tool fully on-screen with no
          horizontal overflow, on both the desktop sidebar and the mobile
          drawer layout. */}
      <div className="relative mt-3">
        <iframe
          src={src}
          title="Pricing & Client Quotes"
          className="block h-[88vh] w-full border-0"
        />
      </div>
    </div>
  );
}
