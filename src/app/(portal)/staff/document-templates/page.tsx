import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import DocumentTemplateForm from "@/components/DocumentTemplateForm";
import TemplateAdminControls from "@/components/TemplateAdminControls";

export default async function DocumentTemplatesPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/");

  const templates = await prisma.documentTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { fields: true, _count: { select: { signedDocuments: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/hr" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          ← Back to HR
        </Link>
        <h1 className="text-2xl font-semibold">Document Templates</h1>
        <p className="text-sm text-neutral-500">
          Reusable personnel documents (offer letters, raise letters, acknowledgments) that get filled in per
          employee and e-signed.
        </p>
      </div>

      <div className="space-y-3">
        {templates.length === 0 && <p className="text-sm text-neutral-500">No templates yet.</p>}
        {templates.map((t) => (
          <div key={t.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Link href={`/staff/document-templates/${t.id}`} className="font-medium text-brand-700 hover:underline">
                  {t.title}
                </Link>
                {!t.active && (
                  <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">Inactive</span>
                )}
                {t.description && <p className="text-xs text-neutral-500">{t.description}</p>}
                <p className="mt-1 text-xs text-neutral-400">
                  {t.fields.length} field{t.fields.length === 1 ? "" : "s"} · used{" "}
                  {t._count.signedDocuments} time{t._count.signedDocuments === 1 ? "" : "s"}
                </p>
              </div>
              <TemplateAdminControls templateId={t.id} active={t.active} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">New Template</h2>
        <DocumentTemplateForm />
      </div>
    </div>
  );
}
