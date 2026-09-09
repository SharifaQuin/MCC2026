import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

export default async function SalesPage() {
  await requireDepartmentAccess("SALES");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Sales</h1>
      <iframe
        src="/api/sales/pricing-tool"
        title="Pricing & Client Quotes"
        className="h-[calc(100vh-160px)] w-full rounded-lg border border-neutral-200"
      />
    </div>
  );
}
