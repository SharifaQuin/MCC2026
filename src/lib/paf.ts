import type { PafActionType, PafStatus } from "@prisma/client";

export const PAF_ACTION_TYPE_LABELS: Record<PafActionType, string> = {
  PROMOTION: "Promotion",
  PAY_CHANGE: "Pay Change",
  TRANSFER: "Transfer",
  TITLE_CHANGE: "Title Change",
  TERMINATION: "Termination",
  OTHER: "Other",
};

export const PAF_STATUS_LABELS: Record<PafStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  EXECUTED: "Executed",
};
