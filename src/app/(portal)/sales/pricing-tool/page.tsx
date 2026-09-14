import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

export default async function SalesPricingToolPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string; leadName?: string; leadAddress?: string; leadService?: string }>;
}) {
  await requireDepartmentAccess("SALES");
  const { quote, leadName, leadAddress, leadService } = await searchParams;

  const query = new URLSearchParams();
  if (quote) query.set("quote", quote);
  if (leadName) query.set("leadName", leadName);
  if (leadAddress) query.set("leadAddress", leadAddress);
  if (leadService) query.set("leadService", leadService);
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
