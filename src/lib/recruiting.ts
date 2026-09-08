import { prisma } from "@/lib/prisma";

// Auto-scores an applicant's prescreen answers against the question bank's
// point values and returns whether they cleared the posting's threshold.
export async function scorePrescreenAnswers(
  jobPostingId: string,
  answers: { questionId: string; optionId: string }[]
) {
  const posting = await prisma.jobPosting.findUniqueOrThrow({
    where: { id: jobPostingId },
    include: { prescreenQuestions: { include: { options: true } } },
  });

  let score = 0;
  let maxScore = 0;
  for (const question of posting.prescreenQuestions) {
    const maxForQuestion = Math.max(0, ...question.options.map((o) => o.points));
    maxScore += maxForQuestion;
    const answer = answers.find((a) => a.questionId === question.id);
    const option = answer && question.options.find((o) => o.id === answer.optionId);
    if (option) score += option.points;
  }

  const scorePct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = scorePct >= posting.passThresholdPct;

  return { score, maxScore, scorePct, passed };
}

export const STAGE_LABELS: Record<string, string> = {
  NEW: "New Applicant",
  PRESCREEN_FAILED: "Prescreen — Not a Fit",
  PRESCREEN_PASSED: "Prescreen Passed",
  PHONE_INTERVIEW_SCHEDULED: "Phone/Zoom Interview Scheduled",
  PHONE_INTERVIEW_PASSED: "Phone/Zoom Interview Passed",
  PHONE_INTERVIEW_FAILED: "Phone/Zoom Interview — Not Advancing",
  IN_PERSON_SCHEDULED: "In-Person Interview Scheduled",
  IN_PERSON_PASSED: "In-Person Interview Passed",
  IN_PERSON_FAILED: "In-Person Interview — Not Advancing",
  OFFER_SENT: "Offer Sent (via Gusto)",
  HIRED: "Hired",
  REJECTED: "Rejected",
  BENCH: "Benched for Future Openings",
};
