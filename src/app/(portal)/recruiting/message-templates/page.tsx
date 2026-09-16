import Link from "next/link";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { getMessageTemplates } from "@/lib/messageTemplates";
import {
  createMessageTemplateAction,
  updateMessageTemplateAction,
  deleteMessageTemplateAction,
} from "../../message-templates/actions";
import MessageTemplateManager from "../../message-templates/MessageTemplateManager";

export default async function RecruitingMessageTemplatesPage() {
  const { canEdit } = await requireRecruitingAccess();
  const templates = await getMessageTemplates("RECRUITING");

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
        ← Back to Recruiting
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-semibold">Message Templates</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Canned emails/texts your team can pick from when reaching out to an applicant — shown
        as a dropdown right in the applicant&apos;s Communication panel.
      </p>

      <MessageTemplateManager
        templates={templates}
        canEdit={canEdit}
        createAction={createMessageTemplateAction.bind(null, "RECRUITING")}
        updateAction={updateMessageTemplateAction.bind(null, "RECRUITING")}
        deleteAction={deleteMessageTemplateAction.bind(null, "RECRUITING")}
        tokenHint="Placeholders: {{firstName}} and {{position}} — auto-filled from the applicant and job posting when picked."
      />
    </div>
  );
}
