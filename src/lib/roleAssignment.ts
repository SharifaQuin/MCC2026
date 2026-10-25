import type { Role } from "@/lib/session";

// Pure data/logic, no server-only imports — safe for both server actions
// (employeeInvite.ts, employeeBulkInvite.ts) and the client-side invite form,
// which needs to know which options to even render.

// The five roles a fixed role selector offers when adding someone — never a
// custom role builder, and ADMIN is deliberately never one of them (granting
// full Owner access stays a manual, out-of-band decision, matching the
// existing admin/permissions screen's own ASSIGNABLE_ROLES).
export type AssignableRole = "TRAINEE" | "TRAINER" | "SERVICE_MANAGER" | "OFFICE_ASSISTANT" | "SALES_REP";

export const ASSIGNABLE_ROLE_LABELS: Record<AssignableRole, string> = {
  TRAINEE: "Trainee",
  TRAINER: "Trainer / Field Supervisor",
  SERVICE_MANAGER: "Service Manager",
  OFFICE_ASSISTANT: "Office Assistant",
  SALES_REP: "Sales Rep",
};

export const ALL_ASSIGNABLE_ROLES: AssignableRole[] = [
  "TRAINEE",
  "TRAINER",
  "SERVICE_MANAGER",
  "OFFICE_ASSISTANT",
  "SALES_REP",
];

// Who can grant which of the five selectable roles when adding a new
// employee. This is a narrow, explicit boundary, not an inferred one:
//
// - ADMIN (the Owner) can grant any of the five.
// - SERVICE_MANAGER can only grant the individual-contributor roles it could
//   already effectively create before this feature existed (Trainee,
//   Trainer) plus the new Sales Rep role, which is the same individual-
//   contributor tier. It cannot grant SERVICE_MANAGER (a peer manager
//   account) or OFFICE_ASSISTANT (a role whose access is owner-configured
//   per-area and can be made very broad) — those stay Owner-only, exactly
//   like the existing admin/permissions role-change screen already
//   restricts both to requireAdmin() only. Widening a SERVICE_MANAGER's
//   invite-time role dropdown must never silently widen who they can invite
//   *as* beyond what they could already invite someone *to become* via that
//   existing, reviewed boundary.
//
// Every other role (TRAINEE, TRAINER, OFFICE_ASSISTANT, SALES_REP) has no
// invite/role-assignment authority at all — the invite form and its actions
// are already gated to isAdminOrServiceManager before this function is ever
// consulted.
export function getAssignableRolesForInviter(inviterRole: Role): AssignableRole[] {
  if (inviterRole === "ADMIN") return ALL_ASSIGNABLE_ROLES;
  if (inviterRole === "SERVICE_MANAGER") return ["TRAINEE", "TRAINER", "SALES_REP"];
  return [];
}
