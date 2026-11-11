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
  { area: "TRAINING_CONTENT_EDIT", label: "Training Content Editing" },
];

// The subset of PermissionArea a Sales Rep may individually be granted,
// alongside her full existing Sales/Operations/Management department
// access (never replacing or narrowing it) — deliberately narrower than
// Office Assistant's full area list above. Staff Directory, Sales Leads,
// Callback Queue, and Operational Status are excluded on purpose: her own
// Sales department access already covers leads/callbacks, and the other
// two stay closed to this role regardless of any stray grant row (see
// getAreaAccessForUser's own defense-in-depth filter in
// src/lib/officeAssistant.ts, and updateAreaAccessAction's matching
// write-side guard). Assigned Tasks isn't included either — every Sales
// Rep already has unconditional to-do access by role, with no area-grant
// concept at all (see requireChecklistTaskEditAccess in
// src/app/actions/financials.ts) — granting it here would be a no-op at
// best and a confusing, narrowing-looking toggle at worst.
export const SALES_REP_GRANTABLE_AREAS: PermissionArea[] = ["HR_SUMMARY", "RECRUITING", "ONBOARDING", "TRAINING"];
