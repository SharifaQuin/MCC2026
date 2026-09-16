"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import type { MessageTemplateScope, CommChannel } from "@prisma/client";

const VALID_CHANNELS = new Set(["EMAIL", "SMS"]);

async function requireScopeAccess(scope: MessageTemplateScope) {
  return scope === "RECRUITING" ? requireRecruitingAccess() : requireDepartmentAccess("SALES");
}

function scopePath(scope: MessageTemplateScope) {
  return scope === "RECRUITING" ? "/recruiting/message-templates" : "/sales/message-templates";
}

export async function createMessageTemplateAction(scope: MessageTemplateScope, formData: FormData) {
  const { session } = await requireScopeAccess(scope);

  const name = String(formData.get("name") ?? "").trim();
  const channelRaw = String(formData.get("channel") ?? "EMAIL");
  const channel = (VALID_CHANNELS.has(channelRaw) ? channelRaw : "EMAIL") as CommChannel;
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  if (!name || !body) return;

  await prisma.messageTemplate.create({
    data: {
      scope,
      channel,
      name,
      subject: channel === "EMAIL" ? subject : null,
      body,
      createdById: session.sub,
    },
  });

  revalidatePath(scopePath(scope));
}

export async function updateMessageTemplateAction(
  scope: MessageTemplateScope,
  id: string,
  formData: FormData
) {
  await requireScopeAccess(scope);

  const name = String(formData.get("name") ?? "").trim();
  const channelRaw = String(formData.get("channel") ?? "EMAIL");
  const channel = (VALID_CHANNELS.has(channelRaw) ? channelRaw : "EMAIL") as CommChannel;
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  if (!name || !body) return;

  await prisma.messageTemplate.update({
    where: { id },
    data: { name, channel, subject: channel === "EMAIL" ? subject : null, body },
  });

  revalidatePath(scopePath(scope));
}

export async function deleteMessageTemplateAction(scope: MessageTemplateScope, id: string) {
  await requireScopeAccess(scope);
  await prisma.messageTemplate.delete({ where: { id } });
  revalidatePath(scopePath(scope));
}
