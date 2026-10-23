import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMyProblemReports } from "@/lib/problemReports";
import { t } from "@/lib/i18n";

const CATEGORY_LABELS: Record<string, string> = {
  BUG_OR_ERROR: "Something's broken",
  ACCOUNT_OR_ACCESS: "Account or access issue",
  DATA_LOOKS_WRONG: "Data looks wrong",
  OTHER: "Other",
};

// Every signed-in role's own private view of what they've reported — never
// the owner's full queue, and never another reporter's rows (enforced in
// getMyProblemReports by the true actor's own id). Reachable from the
// Report a Problem page and from the resolution email's link.
export default async function MyReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const labels = t(session.language);
  const reports = await getMyProblemReports(session);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">{labels.myReportsTitle}</h1>
        <p className="mt-1 text-sm text-neutral-500">{labels.myReportsSubtitle}</p>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-neutral-400">{labels.myReportsEmpty}</p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/my-reports/${r.id}`}
              className="block rounded-md border border-neutral-200 p-4 hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-neutral-900">{CATEGORY_LABELS[r.category] ?? r.category}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    r.status === "OPEN"
                      ? "bg-amber-100 text-amber-700"
                      : r.status === "CONFIRMED"
                        ? "bg-green-100 text-green-700"
                        : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {r.status === "OPEN"
                    ? labels.myReportsStatusOpen
                    : r.status === "CONFIRMED"
                      ? labels.myReportsStatusConfirmed
                      : labels.myReportsStatusResolved}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{r.description}</p>
              <p className="mt-1 text-[11px] text-neutral-400">{new Date(r.createdAt).toLocaleString()}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
