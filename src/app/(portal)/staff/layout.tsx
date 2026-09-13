import Link from "next/link";
import StaffTabs from "@/components/StaffTabs";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/hr" className="text-sm text-brand-700 hover:underline">
          ← Back to HR
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Staff</h1>
      </div>

      <StaffTabs />

      {children}
    </div>
  );
}
