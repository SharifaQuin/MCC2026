import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

export default async function RoutePlannerPage() {
  await requireDepartmentAccess("SALES");

  return (
    <div>
      <Link href="/sales" className="text-sm text-brand-700 hover:underline">
        ← Back to Sales
      </Link>

      {/* Breaks out of the portal's centered max-width column, same as the
          Pricing & Quotes tool, so the iframe gets the full browser width. */}
      <div className="relative mt-3 w-screen ml-[calc(-50vw+50%)]">
        <iframe
          src="/api/sales/route-planner"
          title="Route Day Planner"
          className="block h-[88vh] w-full border-0"
        />
      </div>
    </div>
  );
}
