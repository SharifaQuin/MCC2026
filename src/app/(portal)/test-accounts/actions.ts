"use server";

import { redirect } from "next/navigation";
import { startImpersonation, stopImpersonation } from "@/lib/impersonation";

export async function viewAsAction(targetUserId: string) {
  await startImpersonation(targetUserId);
  redirect("/");
}

export async function stopViewingAsAction() {
  await stopImpersonation();
  redirect("/");
}
