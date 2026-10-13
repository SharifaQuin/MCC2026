import type { PermissionArea } from "@prisma/client";

// Pure data, no server-only imports — safe for client components (the
// Permissions screen's area-select UI) as well as server code. Kept
// separate from src/lib/officeAssistant.ts, which pulls in next/headers
// via session.ts and would break if a client component imported it.
export const PERMISSION_AREAS: { area: PermissionArea; label: string }[] = [
  { area: "HR_SUMMARY", label: "HR Summary" },
  { area: "RECRUITING", label: "Recruiting / Applicants" },
  { area: "ONBOARDING", label: "Onboarding" },
  { area: "TRAINING", label: "Training" },
  { area: "STAFF_DIRECTORY", label: "Staff Directory" },
  { area: "SALES_LEADS", label: "Sales Leads" },
  { area: "CALLBACK_QUEUE", label: "Callback Queue" },
  { area: "OPERATIONAL_STATUS", label: "Operational Status" },
  { area: "ASSIGNED_TASKS", label: "Assigned Tasks (To-Do)" },
];
