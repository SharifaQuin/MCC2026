import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

export default async function ManagementRouteBoardPage() {
  await requireDepartmentAccess("MANAGEMENT");

  return (
    <div>
      <Link href="/management" className="text-sm text-brand-700 hover:underline">
        ← Back to Management
      </Link>

      <div className="relative mt-3 w-screen ml-[calc(-50vw+50%)]">
        <iframe
          src="/api/management/route-board"
          title="Route Board"
          className="block h-[88vh] w-full border-0"
        />
      </div>
    </div>
  );
}
