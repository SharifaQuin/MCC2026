"use client";

import { useState, useTransition } from "react";
import {
  updateUserRoleAction,
  updateDepartmentAccessAction,
  type AccessLevel,
} from "./actions";

export interface PermissionUserRow {
  id: string;
  name: string;
  email: string;
  role: "TRAINEE" | "TRAINER" | "SERVICE_MANAGER";
  access: Record<"SALES" | "OPERATIONS" | "MANAGEMENT", AccessLevel>;
}

const GRANTABLE_DEPARTMENTS: Array<{ key: "SALES" | "OPERATIONS" | "MANAGEMENT"; label: string }> = [
  { key: "SALES", label: "Sales" },
  { key: "OPERATIONS", label: "Operations" },
  { key: "MANAGEMENT", label: "Management" },
];

function RoleSelect({ userId, role }: { userId: string; role: PermissionUserRow["role"] }) {
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as PermissionUserRow["role"];
        setValue(next);
        startTransition(() => {
          void updateUserRoleAction(userId, next);
        });
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
    >
      <option value="TRAINEE">Trainee</option>
      <option value="TRAINER">Trainer / Field Supervisor</option>
      <option value="SERVICE_MANAGER">Service Manager</option>
    </select>
  );
}

function DepartmentAccessSelect({
  userId,
  department,
  level,
}: {
  userId: string;
  department: "SALES" | "OPERATIONS" | "MANAGEMENT";
  level: AccessLevel;
}) {
  const [value, setValue] = useState(level);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as AccessLevel;
        setValue(next);
        startTransition(() => {
          void updateDepartmentAccessAction(userId, department, next);
        });
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-60"
    >
      <option value="NONE">No access</option>
      <option value="VIEW">View only</option>
      <option value="EDIT">Edit</option>
    </select>
  );
}

export default function PermissionsTable({ users }: { users: PermissionUserRow[] }) {
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
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-2">
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-neutral-500">{u.email}</div>
              </td>
              <td className="px-3 py-2">
                <RoleSelect userId={u.id} role={u.role} />
              </td>
              {GRANTABLE_DEPARTMENTS.map((d) => (
                <td key={d.key} className="px-3 py-2">
                  <DepartmentAccessSelect
                    userId={u.id}
                    department={d.key}
                    level={u.access[d.key]}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
