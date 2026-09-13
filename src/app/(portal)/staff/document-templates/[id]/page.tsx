import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import DocumentTemplateForm from "@/components/DocumentTemplateForm";
import TemplateAdminControls from "@/components/TemplateAdminControls";

export default async function EditDocumentTemplatePage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/");

  const template = await prisma.documentTemplate.findUnique({
    where: { id: params.id },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!template) notFound();

  return (
    <div className="space-y-6">
      <Link href="/staff/document-templates" className="inline-block text-sm text-brand-700 hover:underline">
        ← Back to Templates
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{template.title}</h1>
        <TemplateAdminControls templateId={template.id} active={template.active} />
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <DocumentTemplateForm
          templateId={template.id}
          initialTitle={template.title}
          initialDescription={template.description ?? ""}
          initialBodyText={template.bodyText}
          initialFields={template.fields.map((f) => ({
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            required: f.required,
          }))}
        />
      </div>
    </div>
  );
}
