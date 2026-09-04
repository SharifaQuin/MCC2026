import { prisma } from "@/lib/prisma";

export async function getModuleListForUser(userId: string) {
  const modules = await prisma.module.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    include: {
      progress: { where: { userId } },
    },
  });

  let previousCompleted = true;
  return modules.map((m) => {
    const progress = m.progress[0];
    const status = progress?.status ?? "NOT_STARTED";
    const locked = !previousCompleted;
    previousCompleted = status === "COMPLETED";
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
    };
  });
}

export async function getModuleDetail(slug: string, userId: string) {
  const module = await prisma.module.findUnique({
    where: { slug },
    include: {
      lessons: { orderBy: { order: "asc" } },
      quizQuestions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
      progress: { where: { userId } },
    },
  });
  if (!module) return null;

  const allModules = await prisma.module.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const idx = allModules.findIndex((m) => m.id === module.id);
  let locked = false;
  if (idx > 0) {
    const prevModule = allModules[idx - 1];
    const prevProgress = await prisma.moduleProgress.findUnique({
      where: { userId_moduleId: { userId, moduleId: prevModule.id } },
    });
    locked = prevProgress?.status !== "COMPLETED";
  }

  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, moduleId: module.id },
    orderBy: { createdAt: "desc" },
  });

  return {
    module,
    status: module.progress[0]?.status ?? "NOT_STARTED",
    locked,
    attempts,
  };
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

interface GradeResult {
  scorePct: number;
  passed: boolean;
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
  for (const question of questions) {
    const selectedOptionId = answers[question.id];
    const correctOption = question.options.find((o) => o.isCorrect);
    if (selectedOptionId && correctOption && selectedOptionId === correctOption.id) {
      correct += 1;
    }
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

  return { scorePct, passed };
}
