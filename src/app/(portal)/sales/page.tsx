import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

export default async function SalesPage() {
  await requireDepartmentAccess("SALES");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Sales</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Pricing &amp; Client Quotes</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Calculate job pricing, build client-facing quotes, and track profitability.
          </p>
          <Link
            href="/sales/pricing-tool"
            className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Open Pricing &amp; Quotes Tool
          </Link>
        </section>
      </div>
    </div>
  );
}
