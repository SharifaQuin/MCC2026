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
