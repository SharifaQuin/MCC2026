import type { PromotionTargetRole } from "@prisma/client";

export interface ReadinessIndicatorDef {
  key: string;
  label: string;
}

// Editable content, not baked-in logic — the specific indicators are a
// judgment call and will likely get revised after the first few real
// promotion assessments run through the system. Changing this list doesn't
// require a migration; PromotionAssessment.readinessIndicators just stores
// whatever list was in effect at assessment time as {label, met} pairs.
export const READINESS_INDICATORS_BY_ROLE: Record<PromotionTargetRole, ReadinessIndicatorDef[]> = {
  ASSISTANT: [
    { key: "reliability", label: "Consistently reliable — on time, dependable attendance" },
    { key: "quality", label: "Meets quality standards independently on routine cleans" },
    { key: "teamwork", label: "Works well paired with a Lead, takes direction well" },
    { key: "attitude", label: "Positive attitude with clients and teammates" },
  ],
  LEAD: [
    { key: "license", label: "Valid CA driver's license and active insurance on file" },
    { key: "technical", label: "Strong technical skill across all standard service types" },
    { key: "leadership", label: "Can train/guide an Assistant on the job" },
    { key: "client_relations", label: "Handles client communication and concerns well" },
    { key: "independence", label: "Can run a route independently with minimal oversight" },
  ],
  TRAINER: [
    { key: "mastery", label: "Demonstrated mastery across all service types" },
    { key: "teaching", label: "Able to clearly explain and demonstrate technique to new hires" },
    { key: "patience", label: "Patient and encouraging with trainees still learning" },
    { key: "standard_setting", label: "Highest reliability bar — sets the standard for the team" },
  ],
};

export const TARGET_ROLE_LABELS: Record<PromotionTargetRole, string> = {
  ASSISTANT: "Assistant",
  LEAD: "Lead",
  TRAINER: "Trainer",
};

export const PROMOTION_DECISION_LABELS: Record<string, string> = {
  PROMOTE: "Promote",
  DEVELOP: "Develop",
  STAY: "Stay",
  ADDRESS: "Address",
};

export interface ReadinessIndicatorValue {
  label: string;
  met: boolean;
}

export function defaultReadinessIndicators(targetRole: PromotionTargetRole): ReadinessIndicatorValue[] {
  return READINESS_INDICATORS_BY_ROLE[targetRole].map((i) => ({ label: i.label, met: false }));
}

// LEAD requires a valid driver's license + insurance as a condition of the
// role — tied to an actual job requirement, not a suggestion.
export function requiresDriverDocuments(targetRole: PromotionTargetRole): boolean {
  return targetRole === "LEAD";
}

// SERVICE_MANAGER should never see or set the approved pay differential,
// even though the rest of the assessment is otherwise visible to them — a
// real per-field redaction, not a hidden UI element.
export function serializePromotionAssessmentForRole<T extends { payDifferential: number | null }>(
  assessment: T,
  viewerRole: "ADMIN" | "SERVICE_MANAGER" | "TRAINER"
): T {
  if (viewerRole === "ADMIN") return assessment;
  return { ...assessment, payDifferential: null };
}
