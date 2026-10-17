"use server";

import { redirect } from "next/navigation";
import { startActingAs } from "@/lib/impersonation";

// The real-employee counterpart to test-accounts/actions.ts's viewAsAction
// — same underlying startActingAs, just reached from the Staff directory
// instead of the Test Accounts page. There's one "act as" mechanism in the
// app; this only adds a second place to launch it from.
export async function actAsStaffMemberAction(targetUserId: string) {
  await startActingAs(targetUserId);
  redirect("/");
}
