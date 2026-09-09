import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

export default async function SalesPricingToolPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string }>;
}) {
  await requireDepartmentAccess("SALES");
  const { quote } = await searchParams;

  const src = quote
    ? `/api/sales/pricing-tool?quote=${encodeURIComponent(quote)}`
    : "/api/sales/pricing-tool";

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
