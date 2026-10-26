// Member-specific training-content editing. Deliberately separate from the
// TRAINING area (operational/learning access, gated only for OFFICE_ASSISTANT
// via getAreaAccessForUser) and from that function itself — this permission
// is settable for ANY role via the Permissions screen, so it can't reuse
// getAreaAccessForUser's hardcoded "OFFICE_ASSISTANT only" shortcut. Re-reads
// the database on every call (never cached in the session) so a revoked
// grant blocks the very next load or save, including in an already-open
// editor tab.
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, type SessionPayload } from "@/lib/session";
import { ROOKIE_DAY_COUNT } from "@/lib/rookieJourney";

export async function hasTrainingContentEditAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
  if (!user || !user.active) return false;
  if (user.role === "ADMIN") return true;

  const grant = await prisma.areaAccess.findUnique({
    where: { userId_area: { userId, area: "TRAINING_CONTENT_EDIT" } },
  });
  return !!grant?.canEdit;
}

// Redirecting variant for the narrowly-scoped editor route's pages.
export async function requireTrainingContentEditAccess(): Promise<{
  session: SessionPayload;
  isAdmin: boolean;
}> {
  const session = await getSession();
  if (!session) redirect("/login");
  const allowed = await hasTrainingContentEditAccess(session.sub);
  if (!allowed) redirect("/");
  return { session, isAdmin: session.role === "ADMIN" };
}

// Non-redirecting variant for the shared save actions — fails loudly rather
// than navigating a direct/forged call away.
export async function assertTrainingContentEditAccess(): Promise<{
  session: SessionPayload;
  isAdmin: boolean;
}> {
  const session = await getSession();
  if (!session) throw new Error("Not authorized.");
  const allowed = await hasTrainingContentEditAccess(session.sub);
  if (!allowed) throw new Error("Not authorized.");
  return { session, isAdmin: session.role === "ADMIN" };
}

// Curriculum-allowlist boundary for a NON-ADMIN granted editor only — ADMIN
// is never restricted by this. While Rookie Journey is the active training
// mode, the classic 25-module catalog isn't the live curriculum, so a
// non-admin editor may only touch a Lesson that's actually assigned to a
// live Rookie Day (same published + ROOKIE_DAY-slot filter
// getLessonAssignmentOptions already uses to decide a lesson is
// live-assignable — reused here rather than re-derived). Computed fresh on
// every call, never cached, so a mode switch between page load and save is
// re-evaluated at save time. An assignment whose linked day is missing or
// outside 1..ROOKIE_DAY_COUNT (an orphaned/forged assignment) never counts
// as live curriculum, even if its slot is ROOKIE_DAY.
export async function isLessonInLiveRookieCurriculum(lessonId: string): Promise<boolean> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      published: true,
      rookieAssignment: { select: { slot: true, rookieDay: { select: { dayNumber: true } } } },
    },
  });
  return (
    !!lesson?.published &&
    lesson.rookieAssignment.some(
      (a) =>
        a.slot === "ROOKIE_DAY" &&
        !!a.rookieDay &&
        a.rookieDay.dayNumber >= 1 &&
        a.rookieDay.dayNumber <= ROOKIE_DAY_COUNT
    )
  );
}
