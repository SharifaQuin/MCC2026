import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EditDocumentForm from "./EditDocumentForm";
import AssignmentTable, { type EmployeeAssignmentRow } from "./AssignmentTable";

export default async function AdminDocumentDetailPage({ params }: { params: { id: string } }) {
  const doc = await prisma.onboardingDocument.findUnique({ where: { id: params.id } });
  if (!doc) notFound();

  const [employees, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TRAINEE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.onboardingAssignment.findMany({
      where: { documentId: doc.id },
      select: { userId: true, signedAt: true },
    }),
  ]);

  const assignmentByUserId = new Map(assignments.map((a) => [a.userId, a]));
  const rows: EmployeeAssignmentRow[] = employees.map((e) => {
    const a = assignmentByUserId.get(e.id);
    return {
      userId: e.id,
      name: e.name,
      email: e.email,
      assigned: !!a,
      signedAt: a?.signedAt ? a.signedAt.toISOString() : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/documents" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          ← Back to Onboarding Documents
        </Link>
        <h1 className="text-2xl font-semibold">{doc.title}</h1>
      </div>

      <EditDocumentForm doc={doc} />

      <div>
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Assigned Employees</h2>
        <AssignmentTable documentId={doc.id} rows={rows} />
      </div>
    </div>
  );
}
