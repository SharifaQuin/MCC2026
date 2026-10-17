"use server";

import { redirect } from "next/navigation";
import { startActingAs, stopActingAs } from "@/lib/impersonation";

export async function viewAsAction(targetUserId: string) {
  await startActingAs(targetUserId);
  redirect("/");
}

export async function stopViewingAsAction() {
  await stopActingAs();
  redirect("/");
}
