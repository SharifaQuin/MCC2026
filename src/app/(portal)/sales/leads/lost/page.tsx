import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getLostLeads, LEAD_SOURCE_LABELS } from "@/lib/leads";

const money = (n: number) => `$${n.toLocaleString()}`;

export default async function LostLeadsPage() {
  await requireDepartmentAccess("SALES");
  const lostLeads = await getLostLeads();

  return (
    <div>
      <Link href="/sales/leads" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
        ← Back to Pipeline
      </Link>
      <h1 className="mb-2 text-2xl font-semibold">Lost Leads</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Every lead marked Lost, regardless of when — the pipeline board only shows active leads.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Estimated Value</th>
              <th className="px-4 py-3">Lost At</th>
              <th className="px-4 py-3">Lost By</th>
              <th className="px-4 py-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {lostLeads.map((l) => (
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
                  {new Date(l.lostAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-neutral-600">{l.lostByName ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">{l.lostReason ?? "—"}</td>
              </tr>
            ))}
            {lostLeads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No lost leads on file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
