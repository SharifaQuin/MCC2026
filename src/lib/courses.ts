import { prisma } from "@/lib/prisma";

export async function getModuleListForUser(userId: string) {
  const modules = await prisma.module.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    include: {
      progress: { where: { userId } },
      lessons: { where: { published: true }, select: { estimatedMinutes: true } },
    },
  });

  let previousCompleted = true;
  return modules.map((m) => {
    const progress = m.progress[0];
    const status = progress?.status ?? "NOT_STARTED";
    const locked = !previousCompleted;
    previousCompleted = status === "COMPLETED";
    const totalMinutes = m.lessons.some((l) => l.estimatedMinutes)
      ? m.lessons.reduce((sum, l) => sum + (l.estimatedMinutes ?? 0), 0)
      : null;
    return {
      id: m.id,
      slug: m.slug,
      order: m.order,
      titleEn: m.titleEn,
      titleEs: m.titleEs,
      summaryEn: m.summaryEn,
      summaryEs: m.summaryEs,
      status: status as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED",
      locked,
      totalMinutes,
    };
  });
}

async function getModuleLockStatus(moduleId: string, userId: string) {
  const allModules = await prisma.module.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const idx = allModules.findIndex((m) => m.id === moduleId);
  if (idx <= 0) return false;

  const prevModule = allModules[idx - 1];
  const prevProgress = await prisma.moduleProgress.findUnique({
    where: { userId_moduleId: { userId, moduleId: prevModule.id } },
  });
  return prevProgress?.status !== "COMPLETED";
}

export async function getModuleOverview(slug: string, userId: string) {
  const module = await prisma.module.findUnique({
    where: { slug },
    include: {
      lessons: {
        where: { published: true },
        orderBy: { order: "asc" },
        select: { id: true, order: true, titleEn: true, titleEs: true, estimatedMinutes: true },
      },
      progress: { where: { userId } },
    },
  });
  if (!module) return null;

  const locked = await getModuleLockStatus(module.id, userId);
  const status = (module.progress[0]?.status ?? "NOT_STARTED") as
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "COMPLETED";

  const lessonProgress = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: module.lessons.map((l) => l.id) } },
    select: { lessonId: true },
  });
  const completedLessonIds = new Set(lessonProgress.map((p) => p.lessonId));

  // Once a module is fully certified via its quiz, don't keep re-gating
  // lesson-by-lesson navigation for someone just coming back to review it.
  const allLessonsCompleted =
    status === "COMPLETED" || module.lessons.every((l) => completedLessonIds.has(l.id));
  const firstIncompleteOrder =
    module.lessons.find((l) => !completedLessonIds.has(l.id))?.order ?? module.lessons[0]?.order ?? 1;

  return {
    module,
    status,
    locked,
    completedLessonIds,
    allLessonsCompleted,
    firstIncompleteOrder,
  };
}

export async function getLessonDetail(slug: string, order: number, userId: string) {
  const module = await prisma.module.findUnique({
    where: { slug },
    include: { lessons: { where: { published: true }, orderBy: { order: "asc" } } },
  });
  if (!module) return null;

  const lesson = module.lessons.find((l) => l.order === order);
  if (!lesson) return null;

  const locked = await getModuleLockStatus(module.id, userId);
  const status = await prisma.moduleProgress.findUnique({
    where: { userId_moduleId: { userId, moduleId: module.id } },
  });
  const moduleCompleted = status?.status === "COMPLETED";

  const lessonProgress = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: module.lessons.map((l) => l.id) } },
    select: { lessonId: true },
  });
  const completedLessonIds = new Set(lessonProgress.map((p) => p.lessonId));

  const firstIncompleteOrder =
    module.lessons.find((l) => !completedLessonIds.has(l.id))?.order ?? module.lessons[0]?.order ?? 1;
  const priorIncomplete = !moduleCompleted && order > firstIncompleteOrder;

  const totalLessons = module.lessons.length;
  const isLast = order === module.lessons[module.lessons.length - 1]?.order;
  const alreadyCompleted = completedLessonIds.has(lesson.id);

  return {
    module,
    lesson,
    locked,
    priorIncomplete,
    firstIncompleteOrder,
    totalLessons,
    isLast,
    alreadyCompleted,
    moduleCompleted,
  };
}

export async function getModuleQuiz(slug: string, userId: string) {
  const module = await prisma.module.findUnique({
    where: { slug },
    include: {
      quizQuestions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!module) return null;

  const overview = await getModuleOverview(slug, userId);
  if (!overview) return null;

  const nextModule = await prisma.module.findFirst({
    where: { published: true, order: { gt: module.order } },
    orderBy: { order: "asc" },
    select: { slug: true, titleEn: true, titleEs: true },
  });

  return {
    module,
    locked: overview.locked,
    allLessonsCompleted: overview.allLessonsCompleted,
    firstIncompleteOrder: overview.firstIncompleteOrder,
    nextModule,
  };
}

export async function markLessonComplete(userId: string, lessonId: string) {
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId },
    update: {},
  });
}

export async function markModuleInProgress(userId: string, moduleId: string) {
  const existing = await prisma.moduleProgress.findUnique({
    where: { userId_moduleId: { userId, moduleId } },
  });
  if (!existing) {
    await prisma.moduleProgress.create({ data: { userId, moduleId, status: "IN_PROGRESS" } });
  } else if (existing.status === "NOT_STARTED") {
    await prisma.moduleProgress.update({
      where: { id: existing.id },
      data: { status: "IN_PROGRESS" },
    });
  }
}

interface QuestionResult {
  questionId: string;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  correct: boolean;
}

interface GradeResult {
  scorePct: number;
  passed: boolean;
  results: QuestionResult[];
}

export async function submitQuizAttempt(
  userId: string,
  moduleId: string,
  answers: Record<string, string>
): Promise<GradeResult> {
  const questions = await prisma.quizQuestion.findMany({
    where: { moduleId },
    include: { options: true },
  });

  let correct = 0;
  const results: QuestionResult[] = [];
  for (const question of questions) {
    const selectedOptionId = answers[question.id] ?? null;
    const correctOption = question.options.find((o) => o.isCorrect);
    const isCorrect = !!(selectedOptionId && correctOption && selectedOptionId === correctOption.id);
    if (isCorrect) correct += 1;
    results.push({
      questionId: question.id,
      selectedOptionId,
      correctOptionId: correctOption?.id ?? null,
      correct: isCorrect,
    });
  }

  const scorePct = questions.length === 0 ? 100 : Math.round((correct / questions.length) * 100);
  const passed = scorePct === 100;

  await prisma.quizAttempt.create({
    data: { userId, moduleId, scorePct, passed, answers },
  });

  await prisma.moduleProgress.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: {
      userId,
      moduleId,
      status: passed ? "COMPLETED" : "IN_PROGRESS",
      completedAt: passed ? new Date() : null,
    },
    update: {
      status: passed ? "COMPLETED" : "IN_PROGRESS",
      completedAt: passed ? new Date() : null,
    },
  });

  return { scorePct, passed, results };
}
