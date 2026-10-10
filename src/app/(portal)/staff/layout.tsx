import Link from "next/link";
import { getSession } from "@/lib/session";
import StaffTabs from "@/components/StaffTabs";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const showPayrollTab = session?.role === "ADMIN" || session?.role === "SERVICE_MANAGER";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hr" className="text-sm text-brand-700 hover:underline">
          ← Back to HR
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Staff</h1>
      </div>

      <StaffTabs showPayrollTab={showPayrollTab} />

      {children}
    </div>
  );
}
