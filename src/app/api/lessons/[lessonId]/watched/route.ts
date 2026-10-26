import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { markLessonComplete } from "@/lib/courses";
import { getAreaAccessForUser } from "@/lib/officeAssistant";

// Plain route handler (not a Server Action) on purpose: Next.js
// automatically refreshes the calling page's server-rendered tree after
// any Server Action resolves, even one that doesn't redirect. Since this
// fires from a background timer on the lesson page itself (which renders
// the video iframe), that refresh was remounting the iframe — restarting
// the video — and resetting the client-side countdown, looping the
// trainee through the full wait every time it was about to clear.
export async function POST(req: Request, { params }: { params: { lessonId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  // Mirrors the server-side Training-grant check now enforced on the page
  // routes above this — an Office Assistant blocked from /modules must not
  // be able to mark a lesson watched by calling this route directly either.
  if (session.role === "OFFICE_ASSISTANT") {
    const access = await getAreaAccessForUser(session.sub, "TRAINING");
    if (!access.canView) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  await markLessonComplete(session.sub, params.lessonId);

  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string };
  if (slug) revalidatePath(`/modules/${slug}`);

  return NextResponse.json({ ok: true });
}
