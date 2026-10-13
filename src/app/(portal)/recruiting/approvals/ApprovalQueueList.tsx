"use client";

import { RequestRow, type ApprovalRequestRow } from "../applicants/[id]/ApprovalRequestControls";

export default function ApprovalQueueList({
  pending,
  decided,
}: {
  pending: ApprovalRequestRow[];
  decided: ApprovalRequestRow[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 font-medium text-neutral-900">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing waiting on you right now.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((row) => (
              <RequestRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-medium text-neutral-900">Decided</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-neutral-400">No decided requests yet.</p>
        ) : (
          <div className="space-y-2">
            {decided.map((row) => (
              <RequestRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
