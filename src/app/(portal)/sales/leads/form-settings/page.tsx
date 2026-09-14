import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getLeadFormConfig, getActiveLeadFormFields } from "@/lib/leads";
import { redirect } from "next/navigation";
import LeadFormConfigForm from "./LeadFormConfigForm";
import LeadFormFieldEditor from "./LeadFormFieldEditor";

export default async function LeadFormSettingsPage() {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) redirect("/sales/leads");

  const [config, fields] = await Promise.all([getLeadFormConfig(), getActiveLeadFormFields()]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/sales/leads" className="text-sm text-brand-700 hover:underline">
        ← Back to Pipeline
      </Link>
      <h1 className="mb-6 mt-1 text-2xl font-semibold">Lead Form Settings</h1>

      <p className="mb-6 text-sm text-neutral-500">
        Changes here apply immediately to the public form at{" "}
        <a href="/lead-form" target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
          /lead-form
        </a>{" "}
        — the same page you embed on the website.
      </p>

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-6">
        <LeadFormConfigForm config={config} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Custom Questions</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Extra questions shown after the standard fields, in the order below.
        </p>
        <LeadFormFieldEditor fields={fields} />
      </div>
    </div>
  );
}
