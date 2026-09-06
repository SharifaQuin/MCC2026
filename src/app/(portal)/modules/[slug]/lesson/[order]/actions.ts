"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { markLessonComplete } from "@/lib/courses";

export async function completeLessonAction(lessonId: string, slug: string, nextHref: string) {
  const session = await getSession();
  if (!session) redirect("/login");

  await markLessonComplete(session.sub, lessonId);
  revalidatePath(`/modules/${slug}`);
  redirect(nextHref);
}

// Fired automatically once the video watch-timer clears client-side, so
// watching the video is what satisfies the requirement — not a separate
// "Continue" click. Without this, leaving the lesson before clicking
// Continue left it unmarked, so any later navigation (the checklist, the
// module's Continue button) kept bouncing back to this lesson and
// re-imposing the wait, forcing a rewatch that had already happened.
export async function markVideoWatchedAction(lessonId: string, slug: string) {
  const session = await getSession();
  if (!session) return;

  await markLessonComplete(session.sub, lessonId);
  revalidatePath(`/modules/${slug}`);
}
