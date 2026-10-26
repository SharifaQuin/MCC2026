import Link from "next/link";
import { getSession } from "@/lib/session";
import { getTrainingExperienceVersion } from "@/lib/rookieJourney";
import TrainingTabs from "@/components/TrainingTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const hideClassicCatalogTabs = (await getTrainingExperienceVersion()) === "rookie";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hr" className="text-sm text-brand-700 hover:underline">
          ← Back to HR
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Training</h1>
      </div>

      <TrainingTabs isAdmin={session?.role === "ADMIN"} hideClassicCatalogTabs={hideClassicCatalogTabs} />

      {children}
    </div>
  );
}
