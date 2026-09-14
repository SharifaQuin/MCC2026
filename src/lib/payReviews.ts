import type { PayReviewDecision } from "@prisma/client";

export const PAY_REVIEW_DECISION_LABELS: Record<PayReviewDecision, string> = {
  APPROVED: "Approved",
  DENIED: "Denied",
  DEFERRED: "Deferred",
};
