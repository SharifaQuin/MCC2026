import { TARGET_ROLE_LABELS, PROMOTION_DECISION_LABELS } from "@/lib/promotions";
import type { PromotionTargetRole, PromotionDecision } from "@prisma/client";
import type { MilestoneStatus } from "@/lib/milestones";

type Tone = "good" | "warn" | "bad" | "neutral";

const TONE_STYLES: Record<Tone, string> = {
  good: "bg-green-50 text-green-800",
  warn: "bg-amber-50 text-amber-800",
  bad: "bg-red-50 text-red-800",
  neutral: "bg-neutral-50 text-neutral-700",
};

function Tile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={`rounded-md p-3 ${TONE_STYLES[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

// A concise "employee 360" glance — everything Phase 1 unified onto this
// page, condensed into one row so HR doesn't have to scroll every section
// just to see where things stand.
export default function EmployeeSummaryCard({
  currentPair,
  latestPromotion,
  milestoneStatuses,
  validComplaintCount,
  recentSeriousAttendanceCount,
}: {
  currentPair: { role: "LEAD" | "ASSISTANT"; partnerName: string } | null;
  latestPromotion: { targetRole: PromotionTargetRole; decision: PromotionDecision; assessedAt: string } | null;
  milestoneStatuses: MilestoneStatus[];
  validComplaintCount: number;
  recentSeriousAttendanceCount: number;
}) {
  const pairingValue = currentPair
    ? `${currentPair.role === "LEAD" ? "Lead" : "Assistant"} w/ ${currentPair.partnerName}`
    : "Not paired";

  const promotionValue = latestPromotion
    ? `${TARGET_ROLE_LABELS[latestPromotion.targetRole]}: ${PROMOTION_DECISION_LABELS[latestPromotion.decision]}`
    : "No assessments yet";
  const promotionTone: Tone =
    latestPromotion?.decision === "PROMOTE" ? "good" : latestPromotion?.decision === "ADDRESS" ? "bad" : "neutral";

  let milestoneValue = "No hire date set";
  let milestoneTone: Tone = "neutral";
  if (milestoneStatuses.length > 0) {
    if (milestoneStatuses.every((s) => s === "COMPLETED")) {
      milestoneValue = "All caught up";
      milestoneTone = "good";
    } else if (milestoneStatuses.includes("OVERDUE")) {
      milestoneValue = "Overdue";
      milestoneTone = "bad";
    } else if (milestoneStatuses.includes("DUE_SOON")) {
      milestoneValue = "Due soon";
      milestoneTone = "warn";
    } else {
      milestoneValue = "On track";
      milestoneTone = "neutral";
    }
  }

  const complaintTone: Tone = validComplaintCount >= 3 ? "bad" : validComplaintCount > 0 ? "warn" : "good";
  const attendanceTone: Tone = recentSeriousAttendanceCount > 0 ? "warn" : "good";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Pairing" value={pairingValue} />
      <Tile label="Latest Assessment" value={promotionValue} tone={promotionTone} />
      <Tile label="Milestones" value={milestoneValue} tone={milestoneTone} />
      <Tile
        label="Complaints (60d)"
        value={`${validComplaintCount} valid`}
        tone={complaintTone}
      />
      <Tile
        label="Attendance Flags (30d)"
        value={recentSeriousAttendanceCount > 0 ? `${recentSeriousAttendanceCount} serious` : "None"}
        tone={attendanceTone}
      />
    </div>
  );
}
