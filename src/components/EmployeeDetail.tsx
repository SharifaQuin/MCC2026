import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { loadFieldEvaluationsForTrainee } from "@/lib/fieldEvalData";
import { getValidComplaintCount } from "@/lib/hr";
import { getEmployeePayrollEntries } from "@/lib/payroll";
import { yearsOfService } from "@/lib/staff";
import FieldEvaluationHistory from "@/components/FieldEvaluationHistory";
import FieldEvaluationForm from "@/components/FieldEvaluationForm";
import AccountManagement from "@/components/AccountManagement";
import CertificationPanel from "@/components/CertificationPanel";
import ComplaintsPanel from "@/components/ComplaintsPanel";
import AttendancePanel from "@/components/AttendancePanel";
import HireDateForm from "@/components/HireDateForm";

export async function loadEmployeeDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      certRecommendedBy: { select: { name: true } },
      certDecidedBy: { select: { name: true } },
    },
  });
  if (!user) return null;

  const modules = await prisma.module.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    include: {
      progress: { where: { userId } },
      quizAttempts: { where: { userId }, orderBy: { createdAt: "desc" } },
    },
  });

  const fieldEval = await loadFieldEvaluationsForTrainee(userId);

  const onboardingDocs = await prisma.onboardingAssignment.findMany({
    where: { userId },
    include: { document: { select: { id: true, title: true } } },
    orderBy: { document: { order: "asc" } },
  });

  const complaintRows = await prisma.complaint.findMany({
    where: { employeeId: userId },
    include: { loggedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const complaints = complaintRows.map((c) => ({
    id: c.id,
    clientName: c.clientName,
    incidentDate: c.incidentDate ? c.incidentDate.toISOString() : null,
    description: c.description,
    status: c.status,
    resolutionNotes: c.resolutionNotes,
    loggedByName: c.loggedBy.name,
    createdAt: c.createdAt.toISOString(),
  }));
  const validComplaintCount = await getValidComplaintCount(userId);

  const attendanceRows = await prisma.attendanceEvent.findMany({
    where: { employeeId: userId },
    include: { loggedBy: { select: { name: true } } },
    orderBy: { eventDate: "desc" },
  });
  const attendanceEvents = attendanceRows.map((e) => ({
    id: e.id,
    kind: e.kind,
    reasonCategory: e.reasonCategory,
    eventDate: e.eventDate.toISOString(),
    notes: e.notes,
    loggedByName: e.loggedBy.name,
  }));

  const payrollEntries = await getEmployeePayrollEntries(userId);

  return {
    user,
    modules,
    fieldEval,
    onboardingDocs,
    complaints,
    validComplaintCount,
    attendanceEvents,
    payrollEntries,
  };
}

type Detail = NonNullable<Awaited<ReturnType<typeof loadEmployeeDetail>>>;

export function EmployeeDetailView({
  data,
  canManageAccount = false,
  viewerRole,
  showHrTools = false,
}: {
  data: Detail;
  canManageAccount?: boolean;
  viewerRole: "ADMIN" | "TRAINER" | "SERVICE_MANAGER";
  showHrTools?: boolean;
}) {
  const {
    user,
    modules,
    fieldEval,
    onboardingDocs,
    complaints,
    validComplaintCount,
    attendanceEvents,
    payrollEntries,
  } = data;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <p className="text-sm text-neutral-500">{user.email}</p>
      </div>

      {user.role === "TRAINEE" && onboardingDocs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Onboarding Documents</h2>
          <div className="space-y-3">
            {onboardingDocs.map((a) => (
              <Link
                key={a.id}
                href={`/admin/documents/${a.document.id}`}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
              >
                <p className="font-medium">{a.document.title}</p>
                {a.signedAt ? (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                    Signed {new Date(a.signedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                    Pending
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <CertificationPanel
          traineeId={user.id}
          status={user.certificationStatus}
          notes={user.certNotes}
          recommendedAt={user.certRecommendedAt}
          recommendedByName={user.certRecommendedBy?.name ?? null}
          decidedAt={user.certDecidedAt}
          decidedByName={user.certDecidedBy?.name ?? null}
          canRecommend
          canDecide={viewerRole === "ADMIN" || viewerRole === "SERVICE_MANAGER"}
        />
      </section>

      {showHrTools && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Hire Date</h2>
          <HireDateForm
            userId={user.id}
            hireDate={user.hireDate ? user.hireDate.toISOString() : null}
            yearsOfService={user.hireDate ? yearsOfService(user.hireDate) : null}
          />
        </section>
      )}

      {canManageAccount && (
        <section>
          <AccountManagement
            userId={user.id}
            active={user.active}
            mustSetPassword={user.mustSetPassword}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Training Module Progress</h2>
        <div className="space-y-3">
          {modules.map((m) => {
            const status = m.progress[0]?.status ?? "NOT_STARTED";
            const bestAttempt = m.quizAttempts.reduce<number | null>(
              (best, a) => (best === null || a.scorePct > best ? a.scorePct : best),
              null
            );
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{m.titleEn}</p>
                  <p className="text-xs text-neutral-500">
                    {m.quizAttempts.length} attempt{m.quizAttempts.length === 1 ? "" : "s"}
                    {bestAttempt !== null ? ` · best score ${bestAttempt}%` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    status === "COMPLETED"
                      ? "bg-green-100 text-green-700"
                      : status === "IN_PROGRESS"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Field Day Evaluations</h2>
          <FieldEvaluationForm traineeId={user.id} />
        </div>
        <FieldEvaluationHistory
          traineeId={user.id}
          evaluations={fieldEval.evaluations}
          categoryAverages={fieldEval.categoryAverages}
          focusAreas={fieldEval.focusAreas}
        />
      </section>

      {showHrTools && (
        <>
          <section>
            <h2 className="mb-3 text-lg font-medium">Complaints</h2>
            <ComplaintsPanel
              employeeId={user.id}
              complaints={complaints}
              validCount={validComplaintCount}
            />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium">Attendance</h2>
            <AttendancePanel employeeId={user.id} events={attendanceEvents} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium">Payroll</h2>
            {payrollEntries.length === 0 ? (
              <p className="text-sm text-neutral-500">No payroll entries yet.</p>
            ) : (
              <div className="space-y-2">
                {payrollEntries.map((e) => (
                  <Link
                    key={e.id}
                    href={`/staff/payroll/${e.payPeriodId}`}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 text-sm hover:border-brand-300"
                  >
                    <span className="font-medium">{e.payPeriodLabel}</span>
                    <span className="text-neutral-500">
                      {e.regularHours}h reg
                      {e.overtimeHours > 0 ? ` + ${e.overtimeHours}h OT` : ""} · {e.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
