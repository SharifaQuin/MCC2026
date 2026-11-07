import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getScamLeads, LEAD_SOURCE_LABELS } from "@/lib/leads";
import RestoreScamButton from "./RestoreScamButton";

const money = (n: number) => `$${n.toLocaleString()}`;

// Mirrors the Lost Leads page exactly, plus a Restore action — Scam gets
// its own separate archive rather than being folded into "Lost Leads",
// since the owner wants the two concepts kept apart.
export default async function ScamLeadsPage() {
  const { canEdit } = await requireDepartmentAccess("SALES");
  const scamLeads = await getScamLeads();

  return (
    <div>
      <Link href="/sales/leads" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
        ← Back to Pipeline
      </Link>
      <h1 className="mb-2 text-2xl font-semibold">Scam-Classified Leads</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Every lead marked Scam, regardless of when — the pipeline board only shows active leads.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Estimated Value</th>
              <th className="px-4 py-3">Scammed At</th>
              <th className="px-4 py-3">Classified By</th>
              <th className="px-4 py-3">Reason</th>
              {canEdit && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {scamLeads.map((l) => (
              <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/sales/leads/${l.id}`} className="font-medium text-brand-700 hover:underline">
                    {l.firstName} {l.lastName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {LEAD_SOURCE_LABELS[l.source] ?? l.source}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {l.estimatedValue !== null ? money(l.estimatedValue) : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {new Date(l.scamAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-neutral-600">{l.scamByName ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">{l.scamReason ?? "—"}</td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <RestoreScamButton leadId={l.id} expectedUpdatedAt={l.updatedAt.toISOString()} />
                  </td>
                )}
              </tr>
            ))}
            {scamLeads.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-neutral-500">
                  No scam-classified leads on file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
