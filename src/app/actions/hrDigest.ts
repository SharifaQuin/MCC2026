"use server";

import { getSession } from "@/lib/session";
import { postSlackDMToOwner } from "@/lib/slack";
import { getHrTodayAttentionItems, buildHrDigestMessage } from "@/lib/hrToday";

export interface HrDigestState {
  error?: string;
  success?: boolean;
  sentCount?: number;
}

// Manual fallback for the Monday 8am scheduler (see hrDigestScheduler.ts) —
// same reasoning as sendWeeklyUpdateNowAction: a server restart landing on
// exactly the wrong minute shouldn't mean nobody finds out.
export async function sendHrDigestNowAction(): Promise<HrDigestState> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { error: "Not authorized." };
  }

  const items = await getHrTodayAttentionItems();
  if (items.length === 0) {
    return { success: true, sentCount: 0 };
  }

  await postSlackDMToOwner(buildHrDigestMessage(items));
  return { success: true, sentCount: items.length };
}
