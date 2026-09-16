import { prisma } from "@/lib/prisma";
import type { MessageTemplateScope } from "@prisma/client";

export async function getMessageTemplates(scope: MessageTemplateScope) {
  return prisma.messageTemplate.findMany({
    where: { scope },
    orderBy: [{ channel: "asc" }, { name: "asc" }],
  });
}

export { applyTemplateTokens } from "@/lib/templateTokens";
