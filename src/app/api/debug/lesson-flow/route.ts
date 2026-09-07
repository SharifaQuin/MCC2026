import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// TEMPORARY diagnostic route — admin-only. Remove once the lesson-flow
// "Continue does nothing" bug is root-caused; not meant to stay in the app.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const slug = new URL(req.url).searchParams.get("slug") ?? "who-we-are";

  const mod = await prisma.module.findUnique({
    where: { slug },
    include: { lessons: { orderBy: { order: "asc" } } },
  });
  if (!mod) return NextResponse.json({ error: "Module not found." }, { status: 404 });

  const lessonProgress = await prisma.lessonProgress.findMany({
    where: { userId: session.sub, lessonId: { in: mod.lessons.map((l) => l.id) } },
  });

  const moduleProgress = await prisma.moduleProgress.findUnique({
    where: { userId_moduleId: { userId: session.sub, moduleId: mod.id } },
  });

  const completedLessonIds = new Set(lessonProgress.map((p) => p.lessonId));
  const firstIncomplete = mod.lessons.find((l) => !completedLessonIds.has(l.id));

  return NextResponse.json({
    sessionUserId: session.sub,
    module: { id: mod.id, slug: mod.slug, order: mod.order, published: mod.published },
    lessons: mod.lessons.map((l) => ({
      id: l.id,
      order: l.order,
      titleEn: l.titleEn,
      videoUrl: l.videoUrl,
      videoDurationSeconds: l.videoDurationSeconds,
      completed: completedLessonIds.has(l.id),
    })),
    lessonProgressRows: lessonProgress,
    moduleProgress,
    computedFirstIncompleteOrder: firstIncomplete?.order ?? null,
  });
}
