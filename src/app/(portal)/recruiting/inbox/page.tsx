import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import {
  NEEDS_DECISION_STAGES,
  formatRelativeTime,
  getApplicantQualificationSummary,
} from "@/lib/recruiting";
import PageHeader from "@/components/ds/PageHeader";
import Card from "@/components/ds/Card";
import { EmptyState } from "@/components/ds/EmptyState";
import ApplicantQuickCard from "@/components/recruiting-v2/ApplicantQuickCard";
import { inviteToInterviewAction, passApplicantAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RecruitingInboxPage() {
  await requireRecruitingAccess();

  const [qualifiedApplicants, upcomingCount, nextInterview, needsDecisionCount, newHiresIncomplete] =
    await Promise.all([
      prisma.applicant.findMany({
        where: { stage: "PRESCREEN_PASSED" },
        orderBy: { createdAt: "asc" },
        select: { id: true, firstName: true, lastName: true, city: true, createdAt: true },
      }),
      prisma.applicant.count({
        where: { stage: "IN_PERSON_SCHEDULED", scheduledAt: { gt: new Date() } },
      }),
      prisma.applicant.findFirst({
        where: { stage: "IN_PERSON_SCHEDULED", scheduledAt: { gt: new Date() } },
        orderBy: { scheduledAt: "asc" },
        select: { firstName: true, lastName: true, scheduledAt: true },
      }),
      prisma.applicant.count({ where: { stage: { in: NEEDS_DECISION_STAGES } } }),
      prisma.user.count({
        where: { hiredFromApplicant: { isNot: null }, onboardingAssignments: { some: { signedAt: null } } },
      }),
    ]);

  const cards = await Promise.all(
    qualifiedApplicants.map(async (a) => {
      const summary = await getApplicantQualificationSummary(a.id);
      return {
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
        appliedAgo: formatRelativeTime(a.createdAt),
        city: a.city,
        ...summary,
      };
    })
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Recruiting 2.0"
        title="Recruiting Today"
        description="What needs your attention right now."
        actions={
          <>
            <Link href="/recruiting/availability" className="text-sm font-medium text-brand-600 hover:underline">
              Interview Availability
            </Link>
            <Link href="/recruiting" className="text-sm font-medium text-brand-600 hover:underline">
              Full Pipeline View →
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="text-center">
          <p className="text-3xl font-bold text-brand-800">{cards.length}</p>
          <p className="mt-1 text-xs text-neutral-500">Qualified — Need Review</p>
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-bold text-brand-800">{upcomingCount}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Upcoming Interviews
            {nextInterview?.scheduledAt && (
              <span className="mt-1 block font-medium text-brand-600">
                Next: {nextInterview.firstName} {nextInterview.lastName},{" "}
                {new Date(nextInterview.scheduledAt).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-bold text-brand-800">{needsDecisionCount}</p>
          <p className="mt-1 text-xs text-neutral-500">Need a Decision</p>
        </Card>
        <Card className="text-center">
          <p className="text-3xl font-bold text-brand-800">{newHiresIncomplete}</p>
          <p className="mt-1 text-xs text-neutral-500">New Hires — Onboarding Incomplete</p>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Qualified Applicants Needing Review
        </h2>
        {cards.length === 0 ? (
          <EmptyState
            icon="✅"
            title="You're all caught up"
            description="No qualified applicants are waiting on a first decision right now."
          />
        ) : (
          cards.map((c) => (
            <ApplicantQuickCard key={c.id} applicant={c} onInvite={inviteToInterviewAction} onPass={passApplicantAction} />
          ))
        )}
      </div>
    </div>
  );
}
