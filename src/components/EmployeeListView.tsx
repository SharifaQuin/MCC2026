"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EmployeeSummaries } from "@/components/EmployeeList";

type StatusFilter = "ALL" | "ACTIVE" | "INVITE_PENDING" | "PENDING_CERT" | "CERTIFIED" | "DEACTIVATED";

function onboardingDayBadge(createdAt: Date, active: boolean, mustSetPassword: boolean, certified: boolean) {
  if (!active || mustSetPassword || certified) return null;
  const day = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const overdue = day > 3;
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        overdue ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
      }`}
    >
      {overdue ? `Day ${day} (past 3-day goal)` : `Day ${day} of 3`}
    </span>
  );
}

export function EmployeeListView({
  data,
  basePath,
}: {
  data: EmployeeSummaries;
  basePath: string;
}) {
  const { totalModules, users } = data;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
      switch (status) {
        case "ACTIVE":
          return u.active && !u.mustSetPassword && u.certificationStatus !== "CERTIFIED";
        case "INVITE_PENDING":
          return u.active && u.mustSetPassword;
        case "PENDING_CERT":
          return u.certificationStatus === "PENDING";
        case "CERTIFIED":
          return u.certificationStatus === "CERTIFIED";
        case "DEACTIVATED":
          return !u.active;
        default:
          return true;
      }
    });
  }, [users, query, status]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active / In training</option>
          <option value="INVITE_PENDING">Invite pending</option>
          <option value="PENDING_CERT">Pending certification review</option>
          <option value="CERTIFIED">Certified</option>
          <option value="DEACTIVATED">Deactivated</option>
        </select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-neutral-500">
            {users.length === 0 ? "No employees yet." : "No employees match your search."}
          </p>
        )}
        {filtered.map((u) => (
          <Link
            key={u.id}
            href={`${basePath}/${u.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
          >
            <div className={u.active ? "" : "opacity-50"}>
              <p className="font-medium">{u.name}</p>
              <p className="text-xs text-neutral-500">{u.email}</p>
              {!u.active && <p className="mt-1 text-xs font-medium text-red-600">Deactivated</p>}
              {u.active && u.mustSetPassword && (
                <p className="mt-1 text-xs font-medium text-amber-600">Invite pending</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onboardingDayBadge(
                u.createdAt,
                u.active,
                u.mustSetPassword,
                u.certificationStatus === "CERTIFIED"
              )}
              {u.certificationStatus === "CERTIFIED" && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  Technician
                </span>
              )}
              {u.certificationStatus === "PENDING" && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                  Pending Review
                </span>
              )}
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                {u.progress.length} / {totalModules} modules
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
