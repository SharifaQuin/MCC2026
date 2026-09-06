import { prisma } from "@/lib/prisma";

export interface QuestionMissRate {
  totalAnswered: number;
  missRatePct: number | null;
}

export async function loadQuizMissRates(
  moduleId: string
): Promise<Record<string, QuestionMissRate>> {
  const questions = await prisma.quizQuestion.findMany({
    where: { moduleId },
    include: { options: true },
  });

  const attempts = await prisma.quizAttempt.findMany({
    where: { moduleId },
    select: { answers: true },
  });

  const result: Record<string, QuestionMissRate> = {};

  for (const question of questions) {
    const correctOption = question.options.find((o) => o.isCorrect);
    let total = 0;
    let wrong = 0;

    for (const attempt of attempts) {
      const answers = attempt.answers as Record<string, string>;
      const selected = answers[question.id];
      if (selected === undefined) continue;
      total++;
      if (!correctOption || selected !== correctOption.id) wrong++;
    }

    result[question.id] = {
      totalAnswered: total,
      missRatePct: total > 0 ? Math.round((wrong / total) * 100) : null,
    };
  }

  return result;
}
