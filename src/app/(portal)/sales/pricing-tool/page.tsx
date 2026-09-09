import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

export default async function SalesPricingToolPage() {
  await requireDepartmentAccess("SALES");

  return (
    <div>
      <Link href="/sales" className="text-sm text-brand-700 hover:underline">
        ← Back to Sales
      </Link>

      {/* Breaks out of the portal's centered max-w-5xl column so the tool
          gets the full browser width instead of looking boxed in. */}
      <div className="relative mt-3 w-screen ml-[calc(-50vw+50%)]">
        <iframe
          src="/api/sales/pricing-tool"
          title="Pricing & Client Quotes"
          className="block h-[88vh] w-full border-0"
        />
      </div>
    </div>
  );
}
