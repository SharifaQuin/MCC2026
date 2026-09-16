import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getMessageTemplates } from "@/lib/messageTemplates";
import {
  createMessageTemplateAction,
  updateMessageTemplateAction,
  deleteMessageTemplateAction,
} from "../../message-templates/actions";
import MessageTemplateManager from "../../message-templates/MessageTemplateManager";

export default async function SalesMessageTemplatesPage() {
  const { canEdit } = await requireDepartmentAccess("SALES");
  const templates = await getMessageTemplates("SALES");

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/sales" className="text-sm text-brand-700 hover:underline">
        ← Back to Sales
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-semibold">Message Templates</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Canned emails/texts your team can pick from when reaching out to a lead — shown as a
        dropdown right in the lead&apos;s Communication panel.
      </p>

      <MessageTemplateManager
        templates={templates}
        canEdit={canEdit}
        createAction={createMessageTemplateAction.bind(null, "SALES")}
        updateAction={updateMessageTemplateAction.bind(null, "SALES")}
        deleteAction={deleteMessageTemplateAction.bind(null, "SALES")}
        tokenHint="Placeholder: {{firstName}} — auto-filled from the lead when picked."
      />
    </div>
  );
}
