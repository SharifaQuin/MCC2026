import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AddDocumentForm from "./AddDocumentForm";

export default async function AdminDocumentsPage() {
  const documents = await prisma.onboardingDocument.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: { select: { assignments: true } },
      assignments: { where: { signedAt: { not: null } }, select: { id: true } },
    },
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Onboarding Documents</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Paperwork new employees must read and sign before they can start training — offer
        letters, handbooks, policies, agreements, etc.
      </p>

      <div className="mb-6 space-y-3">
        {documents.map((doc) => (
          <Link
            key={doc.id}
            href={`/admin/documents/${doc.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
          >
            <div>
              <p className="font-medium">{doc.title}</p>
              <p className="text-xs text-neutral-500">
                {doc.assignments.length} of {doc._count.assignments} assigned employee
                {doc._count.assignments === 1 ? "" : "s"} signed
              </p>
            </div>
            {doc.assignByDefault && (
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                Assigned by default
              </span>
            )}
          </Link>
        ))}
        {documents.length === 0 && (
          <p className="text-sm text-neutral-500">No onboarding documents yet.</p>
        )}
      </div>

      <AddDocumentForm />
    </div>
  );
}
