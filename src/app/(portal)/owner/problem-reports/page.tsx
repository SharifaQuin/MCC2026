import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getProblemReportsForOwner } from "@/lib/problemReports";
import ProblemReportQueue, { type ProblemReportRow } from "./ProblemReportQueue";

// The Owner's private queue — ADMIN only, deliberately not Service Manager
// too (a report might be about a Service Manager, and this is "my owner
// dashboard," not a general management page). Lives outside /admin on
// purpose: that segment's own layout (src/app/(portal)/admin/layout.tsx) is
// the Training admin area specifically, not a generic admin section. Also
// listed in middleware's ADMIN-only path list as a second enforcement layer.
export default async function ProblemReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const reports = await getProblemReportsForOwner();
  const rows: ProblemReportRow[] = reports.map((r) => ({
    id: r.id,
    reporterName: r.reporterName,
    reporterRole: r.reporterRole,
    category: r.category,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    latestResolutionId: r.latestResolutionId,
    resolutions: r.resolutions.map((res) => ({
      id: res.id,
      note: res.note,
      resolvedByName: res.resolvedBy.name,
      resolvedAt: res.resolvedAt.toISOString(),
      emailStatus: res.emailStatus,
      emailError: res.emailError,
    })),
    feedback: r.feedback.map((f) => ({
      id: f.id,
      outcome: f.outcome,
      note: f.note,
      createdAt: f.createdAt.toISOString(),
    })),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Problem Reports</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Private to you — staff submissions from Report a Problem. Nobody else can see this page.
        </p>
      </div>
      <ProblemReportQueue reports={rows} />
    </div>
  );
}
