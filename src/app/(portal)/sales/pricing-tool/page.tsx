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

      {/* Breaks out of the portal's centered max-w-5xl column so the tool
          gets the full browser width instead of looking boxed in. */}
      <div className="relative mt-3 w-screen ml-[calc(-50vw+50%)]">
        <iframe
          src={src}
          title="Pricing & Client Quotes"
          className="block h-[88vh] w-full border-0"
        />
      </div>
    </div>
  );
}
