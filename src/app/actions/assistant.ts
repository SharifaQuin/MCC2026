"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/session";
import { runAssistantConversation } from "@/lib/assistant";

async function requireOwnerAccess() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session;
}

export interface SendAssistantMessageResult {
  messages?: Anthropic.MessageParam[];
  reply?: string;
  toolsUsed?: string[];
  error?: string;
}

export async function sendAssistantMessageAction(
  priorMessages: Anthropic.MessageParam[],
  userText: string
): Promise<SendAssistantMessageResult> {
  await requireOwnerAccess();

  const trimmed = userText.trim();
  if (!trimmed) return { error: "Type a question first." };

  try {
    const { messages, reply, toolsUsed } = await runAssistantConversation(priorMessages, trimmed);
    return { messages, reply, toolsUsed };
  } catch (error) {
    console.error("Assistant conversation failed:", error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
