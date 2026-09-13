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
import PairingPanel from "@/components/PairingPanel";
import PromotionPanel, { type PromotionAssessmentRow } from "@/components/PromotionPanel";
import MilestonePanel, { type MilestoneTimelineEntryView } from "@/components/MilestonePanel";
import { getCurrentPairForEmployee, getPairHistoryForEmployee, getPairingCandidates } from "@/lib/pairing";
import { buildMilestoneTimeline } from "@/lib/milestones";
import { serializePromotionAssessmentForRole, type ReadinessIndicatorValue } from "@/lib/promotions";

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

  const [currentPair, pairHistory, pairingCandidates] = await Promise.all([
    getCurrentPairForEmployee(userId),
    getPairHistoryForEmployee(userId),
    getPairingCandidates(userId),
  ]);

  const promotionAssessmentRows = await prisma.promotionAssessment.findMany({
    where: { employeeId: userId },
    include: { assessedBy: { select: { name: true } } },
    orderBy: { assessedAt: "desc" },
  });
  const promotionAssessments = promotionAssessmentRows.map((a) => ({
    id: a.id,
    targetRole: a.targetRole,
    readinessIndicators: a.readinessIndicators as unknown as ReadinessIndicatorValue[],
    decision: a.decision,
    developmentPlan: a.developmentPlan,
    reassessmentDate: a.reassessmentDate ? a.reassessmentDate.toISOString() : null,
    payDifferential: a.payDifferential,
    assessedByName: a.assessedBy.name,
    assessedAt: a.assessedAt.toISOString(),
  }));

  const milestoneReviewRows = await prisma.milestoneReview.findMany({
    where: { employeeId: userId },
  });
  const milestoneTimeline = user.hireDate
    ? buildMilestoneTimeline(user.hireDate, milestoneReviewRows).map((entry) => ({
        checkpoint: entry.checkpoint,
        label: entry.label,
        dueDate: entry.dueDate.toISOString(),
        status: entry.status,
        review: entry.review
          ? {
              id: entry.review.id,
              completedAt: entry.review.completedAt ? entry.review.completedAt.toISOString() : null,
              score: entry.review.score,
              notes: entry.review.notes,
            }
          : null,
      }))
    : [];

  return {
    user,
    modules,
    fieldEval,
    onboardingDocs,
    complaints,
    validComplaintCount,
    attendanceEvents,
    payrollEntries,
    currentPair,
    pairHistory,
    pairingCandidates,
    promotionAssessments,
    milestoneTimeline,
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
    currentPair,
    pairHistory,
    pairingCandidates,
    promotionAssessments,
    milestoneTimeline,
  } = data;

  const visiblePromotionAssessments = promotionAssessments.map((a) =>
    serializePromotionAssessmentForRole(a, viewerRole)
  );

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

      {showHrTools && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Pairing</h2>
          <PairingPanel
            employeeId={user.id}
            currentPair={
              currentPair
                ? {
                    pairId: currentPair.pair.id,
                    role: currentPair.role,
                    partnerId: currentPair.partner.id,
                    partnerName: currentPair.partner.name,
                    startDate: currentPair.pair.startDate.toISOString(),
                  }
                : null
            }
            history={pairHistory}
            candidates={pairingCandidates}
          />
        </section>
      )}

      {showHrTools && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Promotion Assessments</h2>
          <PromotionPanel
            employeeId={user.id}
            assessments={visiblePromotionAssessments}
            canSetPayDifferential={viewerRole === "ADMIN"}
          />
        </section>
      )}

      {showHrTools && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Milestone Reviews</h2>
          {user.hireDate ? (
            <MilestonePanel employeeId={user.id} timeline={milestoneTimeline} />
          ) : (
            <p className="text-sm text-neutral-500">Set a hire date above to enable milestone review tracking.</p>
          )}
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
