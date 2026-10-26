"use client";

import { Fragment, useState, useTransition } from "react";
import {
  updateUserRoleAction,
  updateDepartmentAccessAction,
  updateAreaAccessAction,
  updateApprovalManagerAction,
  type AccessLevel,
} from "./actions";
import { PERMISSION_AREAS } from "@/lib/permissionAreas";
import type { PermissionArea } from "@prisma/client";

export interface PermissionUserRow {
  id: string;
  name: string;
  email: string;
  role: "TRAINEE" | "TRAINER" | "SERVICE_MANAGER" | "OFFICE_ASSISTANT" | "SALES_REP";
  access: Record<"SALES" | "OPERATIONS" | "MANAGEMENT", AccessLevel>;
  areaAccess: Record<PermissionArea, AccessLevel>;
  approvalManagerId: string | null;
}

const GRANTABLE_DEPARTMENTS: Array<{ key: "SALES" | "OPERATIONS" | "MANAGEMENT"; label: string }> = [
  { key: "SALES", label: "Sales" },
  { key: "OPERATIONS", label: "Operations" },
  { key: "MANAGEMENT", label: "Management" },
];

function RoleSelect({
  userId,
  role,
  onChange,
}: {
  userId: string;
  role: PermissionUserRow["role"];
  onChange: (next: PermissionUserRow["role"]) => void;
}) {
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as PermissionUserRow["role"];
        setValue(next);
        onChange(next);
        startTransition(() => {
          void updateUserRoleAction(userId, next);
        });
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
    >
      <option value="TRAINEE">Trainee</option>
      <option value="TRAINER">Trainer / Field Supervisor</option>
      <option value="SERVICE_MANAGER">Service Manager</option>
      <option value="OFFICE_ASSISTANT">Office Assistant</option>
      <option value="SALES_REP">Sales Rep</option>
    </select>
  );
}

function AccessSelect({
  value,
  onChange,
  size = "sm",
}: {
  value: AccessLevel;
  onChange: (next: AccessLevel) => void;
  size?: "sm" | "xs";
}) {
  const [current, setCurrent] = useState(value);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as AccessLevel;
        setCurrent(next);
        startTransition(() => onChange(next));
      }}
      className={`rounded-md border border-neutral-300 disabled:opacity-60 ${
        size === "xs" ? "px-2 py-1 text-xs" : "px-2 py-1 text-sm"
      }`}
    >
      <option value="NONE">No access</option>
      <option value="VIEW">View only</option>
      <option value="EDIT">Edit</option>
    </select>
  );
}

// Training content editing has no "view only" meaning of its own (the
// feature is entirely about editing), so unlike AccessSelect's three
// states this is a plain on/off toggle — off deletes the AreaAccess row,
// on upserts it with canEdit:true.
function TrainingContentEditToggle({
  userId,
  granted,
}: {
  userId: string;
  granted: boolean;
}) {
  const [value, setValue] = useState(granted);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value ? "EDIT" : "NONE"}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value === "EDIT";
        setValue(next);
        startTransition(() => {
          void updateAreaAccessAction(userId, "TRAINING_CONTENT_EDIT", next ? "EDIT" : "NONE");
        });
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
    >
      <option value="NONE">No access</option>
      <option value="EDIT">Can edit</option>
    </select>
  );
}

function ApprovalManagerSelect({
  userId,
  managerId,
  eligibleManagers,
}: {
  userId: string;
  managerId: string | null;
  eligibleManagers: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(managerId ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        startTransition(() => {
          void updateApprovalManagerAction(userId, next);
        });
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
    >
      <option value="">— Not set (submissions blocked) —</option>
      {eligibleManagers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

// Office Assistant's own area grants only — Training Content Editing is
// shown as its own always-visible column in the main table instead (it's
// settable for any role, not just Office Assistant), so it's excluded here
// to avoid showing the same toggle twice for an Office Assistant row.
const OFFICE_ASSISTANT_AREAS = PERMISSION_AREAS.filter((a) => a.area !== "TRAINING_CONTENT_EDIT");

function OfficeAssistantAreaPanel({
  user,
  eligibleManagers,
}: {
  user: PermissionUserRow;
  eligibleManagers: { id: string; name: string }[];
}) {
  return (
    <tr>
      <td colSpan={3 + GRANTABLE_DEPARTMENTS.length} className="bg-neutral-50 px-3 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Office Assistant Areas — {user.name}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {OFFICE_ASSISTANT_AREAS.map(({ area, label }) => (
            <div key={area} className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
              <span className="text-xs text-neutral-700">{label}</span>
              <AccessSelect
                value={user.areaAccess[area]}
                size="xs"
                onChange={(next) => updateAreaAccessAction(user.id, area, next)}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-700">Approval manager (for Send for approval requests):</span>
          <ApprovalManagerSelect userId={user.id} managerId={user.approvalManagerId} eligibleManagers={eligibleManagers} />
        </div>
        {!user.approvalManagerId && (
          <p className="mt-1 text-xs text-amber-700">
            No approval manager set — this person cannot submit an approval request until one is
            chosen.
          </p>
        )}
      </td>
    </tr>
  );
}

export default function PermissionsTable({
  users,
  eligibleManagers,
}: {
  users: PermissionUserRow[];
  eligibleManagers: { id: string; name: string }[];
}) {
  const [roleOverrides, setRoleOverrides] = useState<Record<string, PermissionUserRow["role"]>>({});

  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Role</th>
            {GRANTABLE_DEPARTMENTS.map((d) => (
              <th key={d.key} className="px-3 py-2">
                {d.label}
              </th>
            ))}
            <th className="px-3 py-2">Training Content Editing</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {users.map((u) => {
            const currentRole = roleOverrides[u.id] ?? u.role;
            const isOfficeAssistant = currentRole === "OFFICE_ASSISTANT";
            return (
              <Fragment key={u.id}>
                <tr>
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-neutral-500">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <RoleSelect
                      userId={u.id}
                      role={u.role}
                      onChange={(next) => setRoleOverrides((prev) => ({ ...prev, [u.id]: next }))}
                    />
                  </td>
                  {GRANTABLE_DEPARTMENTS.map((d) => (
                    <td key={d.key} className="px-3 py-2">
                      {isOfficeAssistant ? (
                        <span className="text-xs text-neutral-400">
                          {d.key === "MANAGEMENT" ? "No access" : "Use areas below"}
                        </span>
                      ) : (
                        <AccessSelect
                          value={u.access[d.key]}
                          onChange={(next) => updateDepartmentAccessAction(u.id, d.key, next)}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <TrainingContentEditToggle userId={u.id} granted={u.areaAccess.TRAINING_CONTENT_EDIT === "EDIT"} />
                  </td>
                </tr>
                {isOfficeAssistant && (
                  <OfficeAssistantAreaPanel user={u} eligibleManagers={eligibleManagers} />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
