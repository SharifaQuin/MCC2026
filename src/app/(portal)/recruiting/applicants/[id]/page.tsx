import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { STAGE_LABELS, SCHEDULING_STAGES, INTERVIEW_SCORECARD_COMPETENCIES, DEFAULT_PHONE_SCREEN_CRITERIA, WORKING_SESSION_CHECKLIST_ITEMS, getOnboardingChecklist, SCORED_CATEGORIES } from "@/lib/recruiting";
import { getMessageTemplates } from "@/lib/messageTemplates";
import { formatInBusinessTimezone } from "@/lib/timezone";
import StageControls from "./StageControls";
import InterviewDecisionPanel from "./InterviewDecisionPanel";
import CommunicationPanel from "./CommunicationPanel";
import ApplicantTabs from "./ApplicantTabs";
import PhoneScreenTab from "./PhoneScreenTab";
import InterviewTab from "./InterviewTab";
import WorkingSessionTab from "./WorkingSessionTab";
import ReferencesTab from "./ReferencesTab";
import ApplicantNotesTab from "./ApplicantNotesTab";
import OnboardingChecklistTab from "./OnboardingChecklistTab";

export default async function ApplicantDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { duplicate?: string; tab?: string };
}) {
  const { session, canEdit } = await requireRecruitingAccess();

  const applicant = await prisma.applicant.findUnique({
    where: { id: params.id },
    include: {
      jobPosting: {
        select: {
          titleEn: true,
          roleTrack: true,
          phoneScreenQuestions: { orderBy: { order: "asc" } },
          interviewQuestions: { orderBy: { order: "asc" } },
        },
      },
      hiredUser: { select: { id: true, name: true } },
      answers: {
        include: { question: true, option: true },
      },
      communications: {
        orderBy: { createdAt: "desc" },
        include: { sentBy: { select: { name: true } } },
      },
      notesLog: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
      phoneScreenAnswers: true,
      phoneScreenResult: { include: { completedBy: { select: { name: true } } } },
      interviewAnswers: true,
      interviewScorecards: {
        orderBy: { createdAt: "desc" },
        include: { evaluator: { select: { name: true } }, competencyScores: true },
      },
      workingSession: { include: { leadEvaluator: { select: { name: true } } } },
      referenceChecks: {
        orderBy: { createdAt: "desc" },
        include: { completedBy: { select: { name: true } } },
      },
    },
  });

  if (!applicant) {
    return <p className="text-neutral-500">Applicant not found.</p>;
  }

  const messageTemplates = await getMessageTemplates("RECRUITING");
  const onboardingChecklist =
    applicant.stage === "HIRED" ? await getOnboardingChecklist(applicant.id) : [];

  // Stamp "viewed" once, the first time anyone opens this profile — a
  // persistent marker distinct from moving them through the pipeline.
  if (!applicant.viewedAt) {
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { viewedAt: new Date(), viewedById: session.sub },
    });
  }

  const commHistory = applicant.communications.map((c) => ({
    id: c.id,
    channel: c.channel,
    direction: c.direction,
    subject: c.subject,
    body: c.body,
    status: c.status,
    errorMessage: c.errorMessage,
    createdAt: c.createdAt.toISOString(),
    sentByName: c.sentBy?.name ?? null,
  }));

  const notesEntries = applicant.notesLog.map((n) => ({
    id: n.id,
    createdAt: n.createdAt.toISOString(),
    body: n.body,
    authorName: n.author?.name ?? null,
  }));

  const phoneScreenAnswersByQuestion = Object.fromEntries(
    applicant.phoneScreenAnswers.map((a) => [a.questionId, a.responseText])
  );

  const interviewAnswersByQuestion = Object.fromEntries(
    applicant.interviewAnswers.map((a) => [a.questionId, a.responseText])
  );

  // Core questions always show; role-differentiated ones show only for the
  // matching track, or both sets when the posting's track is still
  // undecided (Track B) — per the toolkit's own instruction.
  const roleTrack = applicant.jobPosting.roleTrack;
  const visibleInterviewQuestions = applicant.jobPosting.interviewQuestions.filter((q) => {
    if (q.roleScope === "ALL") return true;
    if (roleTrack === "OTHER") return true;
    return q.roleScope === (roleTrack === "LEAD_TECHNICIAN" ? "LEAD_ONLY" : "ASSISTANT_ONLY");
  });

  const competencies = INTERVIEW_SCORECARD_COMPETENCIES[roleTrack] ?? INTERVIEW_SCORECARD_COMPETENCIES.OTHER;

  const scorecards = applicant.interviewScorecards.map((sc) => ({
    id: sc.id,
    evaluatorName: sc.evaluator?.name ?? null,
    recommendation: sc.recommendation,
    rationale: sc.rationale,
    concerns: sc.concerns,
    createdAt: sc.createdAt.toISOString(),
    competencyScores: sc.competencyScores.map((cs) => ({
      competency: cs.competency,
      score: cs.score,
      evidence: cs.evidence,
    })),
  }));

  const workingSessionData = applicant.workingSession
    ? {
        scheduledAt: applicant.workingSession.scheduledAt?.toISOString() ?? null,
        housesToVisit: applicant.workingSession.housesToVisit,
        preSessionChecklist: applicant.workingSession.preSessionChecklist as
          | { label: string; checked: boolean }[]
          | null,
        leadEvaluatorName: applicant.workingSession.leadEvaluator?.name ?? null,
        honestAssessment: applicant.workingSession.honestAssessment,
        concernsRaised: applicant.workingSession.concernsRaised,
        recommendation: applicant.workingSession.recommendation,
        updatedAt: applicant.workingSession.updatedAt?.toISOString() ?? null,
        technicalScore: applicant.workingSession.technicalScore,
        technicalNotes: applicant.workingSession.technicalNotes,
        paceStaminaScore: applicant.workingSession.paceStaminaScore,
        paceStaminaNotes: applicant.workingSession.paceStaminaNotes,
        attentionDetailScore: applicant.workingSession.attentionDetailScore,
        attentionDetailNotes: applicant.workingSession.attentionDetailNotes,
        clientHomeScore: applicant.workingSession.clientHomeScore,
        clientHomeNotes: applicant.workingSession.clientHomeNotes,
        coachabilityScore: applicant.workingSession.coachabilityScore,
        coachabilityNotes: applicant.workingSession.coachabilityNotes,
        pairDynamicScore: applicant.workingSession.pairDynamicScore,
        pairDynamicNotes: applicant.workingSession.pairDynamicNotes,
        safetyScore: applicant.workingSession.safetyScore,
        safetyNotes: applicant.workingSession.safetyNotes,
      }
    : null;

  const referenceEntries = applicant.referenceChecks.map((r) => ({
    id: r.id,
    referenceName: r.referenceName,
    referenceRelationship: r.referenceRelationship,
    durationKnown: r.durationKnown,
    referencePhone: r.referencePhone,
    calledAt: r.calledAt?.toISOString() ?? null,
    capacityDuration: r.capacityDuration,
    responsibilities: r.responsibilities,
    strengths: r.strengths,
    growthAreas: r.growthAreas,
    customerFacing: r.customerFacing,
    handledFeedback: r.handledFeedback,
    wouldRehire: r.wouldRehire,
    anythingElse: r.anythingElse,
    verdict: r.verdict,
    redFlagsSurfaced: r.redFlagsSurfaced,
    completedByName: r.completedBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  const overviewContent = (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-400">Email</dt>
            <dd>{applicant.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Phone</dt>
            <dd>{applicant.phone}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Applied</dt>
            <dd>{applicant.createdAt.toLocaleDateString()}</dd>
          </div>
          {applicant.resumeDataUrl && (
            <div>
              <dt className="text-neutral-400">Resume</dt>
              <dd className="flex items-center gap-3">
                <a
                  href={applicant.resumeDataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  View{applicant.resumeFileName ? ` (${applicant.resumeFileName})` : ""}
                </a>
                <a
                  href={applicant.resumeDataUrl}
                  download={applicant.resumeFileName ?? "resume"}
                  className="text-xs text-neutral-500 hover:underline"
                >
                  Download
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {applicant.prescreenScore !== null && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-neutral-900">
            Prescreen Score: {applicant.prescreenScore}/{applicant.prescreenMaxScore}{" "}
            <span className={applicant.prescreenPassed ? "text-green-700" : "text-red-700"}>
              ({applicant.prescreenPassed ? "Passed" : "Below threshold"})
            </span>
          </h2>
          {/* Every application answer, in question order, whatever its
              type — the full profile is always the source for a complete
              read of everything the applicant submitted, not just what
              Quick Review chooses to surface. MULTI_SELECT answers are
              grouped by question since each checked option is its own row. */}
          <ul className="space-y-3 text-sm">
            {Object.entries(
              applicant.answers.reduce<Record<string, typeof applicant.answers>>((acc, a) => {
                (acc[a.questionId] ??= []).push(a);
                return acc;
              }, {})
            ).map(([questionId, group]) => {
              const question = group[0].question;
              return (
                <li key={questionId}>
                  <p className="text-neutral-500">{question.textEn}</p>
                  {question.type === "SINGLE_SELECT" && group[0].option && (
                    <p className="font-medium text-neutral-900">
                      {group[0].option.textEn}
                      {SCORED_CATEGORIES.has(question.category) && ` (${group[0].option.points} pts)`}
                    </p>
                  )}
                  {question.type === "MULTI_SELECT" && (
                    <p className="font-medium text-neutral-900">
                      {group.map((a) => a.option?.textEn).filter(Boolean).join(", ")}
                    </p>
                  )}
                  {(question.type === "TEXT" || question.type === "DATE") && group[0].answerText && (
                    <p className="whitespace-pre-wrap font-medium text-neutral-900">
                      {group[0].answerText}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {applicant.stage === "IN_PERSON_SCHEDULED" && (
        <InterviewDecisionPanel applicantId={applicant.id} />
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-neutral-900">Move Applicant</h2>
        <StageControls applicantId={applicant.id} stage={applicant.stage} />
      </div>
    </div>
  );

  const tabs = [
    { id: "overview", label: "Overview", content: overviewContent },
    {
      id: "comms",
      label: "Communication",
      content: (
        <CommunicationPanel
          applicantId={applicant.id}
          history={commHistory}
          templates={messageTemplates}
          firstName={applicant.firstName}
          positionTitle={applicant.jobPosting.titleEn}
        />
      ),
    },
    {
      id: "phone",
      label: "Phone Screen",
      content: (
        <PhoneScreenTab
          applicantId={applicant.id}
          questions={applicant.jobPosting.phoneScreenQuestions}
          answers={phoneScreenAnswersByQuestion}
          criteriaLabels={DEFAULT_PHONE_SCREEN_CRITERIA}
          criteriaChecklist={
            (applicant.phoneScreenResult?.criteriaChecklist as { label: string; checked: boolean }[] | null) ??
            null
          }
          languageNote={applicant.phoneScreenResult?.languageNote ?? null}
          outcome={applicant.phoneScreenResult?.outcome ?? null}
          redFlagsNotes={applicant.phoneScreenResult?.redFlagsNotes ?? null}
          completedAt={applicant.phoneScreenResult?.completedAt?.toISOString() ?? null}
          completedByName={applicant.phoneScreenResult?.completedBy?.name ?? null}
          canEdit={canEdit}
        />
      ),
    },
    {
      id: "interview",
      label: "In-Person Interview",
      content: (
        <InterviewTab
          applicantId={applicant.id}
          questions={visibleInterviewQuestions}
          answers={interviewAnswersByQuestion}
          competencies={competencies}
          scorecards={scorecards}
          canEdit={canEdit}
        />
      ),
    },
    {
      id: "working-session",
      label: "Working Session",
      content: (
        <WorkingSessionTab
          applicantId={applicant.id}
          checklistLabels={WORKING_SESSION_CHECKLIST_ITEMS}
          record={workingSessionData}
          canEdit={canEdit}
        />
      ),
    },
    {
      id: "references",
      label: "References",
      content: <ReferencesTab applicantId={applicant.id} references={referenceEntries} canEdit={canEdit} />,
    },
    {
      id: "notes",
      label: "Notes",
      content: <ApplicantNotesTab applicantId={applicant.id} notes={notesEntries} canEdit={canEdit} />,
    },
    ...(applicant.stage === "HIRED"
      ? [
          {
            id: "onboarding",
            label: "Onboarding Checklist",
            content: <OnboardingChecklistTab applicantId={applicant.id} items={onboardingChecklist} />,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
          ← Back to Pipeline
        </Link>
        <Link href="/recruiting/applicants" className="text-sm text-brand-700 hover:underline">
          ← Back to Applicants
        </Link>
      </div>

      {searchParams.duplicate === "1" && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          An applicant with this email was already on file for this posting, so we brought you
          to their existing profile instead of creating a duplicate.
        </div>
      )}

      {applicant.hiredUser && (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Hired — training account created.{" "}
          <Link
            href={`/admin/employees/${applicant.hiredUser.id}`}
            className="font-medium hover:underline"
          >
            View {applicant.hiredUser.name}&apos;s employee profile →
          </Link>
        </div>
      )}

      {applicant.scheduledAt && (SCHEDULING_STAGES as string[]).includes(applicant.stage) && (
        <div
          className={`mt-3 flex items-center justify-between rounded-md border p-3 text-sm ${
            applicant.interviewCantMakeItAt
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <span>
            {STAGE_LABELS[applicant.stage]}: {formatInBusinessTimezone(applicant.scheduledAt)} PT
          </span>
          {applicant.interviewCantMakeItAt ? (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
              ⚠ Can't make it — needs rescheduling
            </span>
          ) : applicant.interviewConfirmedAt ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
              ✓ Confirmed {new Date(applicant.interviewConfirmedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">
              Not yet confirmed
            </span>
          )}
        </div>
      )}

      <div className="mb-6 mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {applicant.firstName} {applicant.lastName}
          </h1>
          <p className="text-neutral-500">{applicant.jobPosting.titleEn}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
            {STAGE_LABELS[applicant.stage]}
          </span>
          {applicant.viewedAt && (
            <span className="text-xs text-neutral-400">
              Viewed {new Date(applicant.viewedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <ApplicantTabs tabs={tabs} initialTab={typeof searchParams.tab === "string" ? searchParams.tab : undefined} />
    </div>
  );
}
