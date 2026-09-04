import { prisma } from "@/lib/prisma";
import { FIELD_EVAL_CATEGORIES, averageScore } from "@/lib/fieldEval";

export async function loadFieldEvaluationsForTrainee(traineeId: string) {
  const evaluations = await prisma.fieldEvaluation.findMany({
    where: { traineeId },
    orderBy: { fieldDate: "desc" },
    include: {
      categories: true,
      gradedBy: { select: { name: true } },
    },
  });

  const overallHistory = evaluations.map((e) => ({
    id: e.id,
    fieldDate: e.fieldDate,
    gradedByName: e.gradedBy.name,
    generalNotes: e.generalNotes,
    overallScore: averageScore(e.categories.map((c) => c.score)),
    categories: e.categories.map((c) => ({
      categoryKey: c.categoryKey,
      score: c.score,
      checkedItems: c.checkedItems as string[],
      notes: c.notes,
    })),
  }));

  const categoryAverages = FIELD_EVAL_CATEGORIES.map((def) => {
    const scores = evaluations.flatMap((e) =>
      e.categories.filter((c) => c.categoryKey === def.key).map((c) => c.score)
    );
    return {
      key: def.key,
      label: def.label,
      relatedModuleTitles: def.relatedModuleTitles,
      average: averageScore(scores),
      entryCount: scores.length,
    };
  });

  const focusAreas = categoryAverages.filter((c) => c.average !== null && c.average < 3);

  return { evaluations: overallHistory, categoryAverages, focusAreas };
}

export async function loadFieldEvaluationSummaryForTrainee(traineeId: string) {
  const evaluations = await prisma.fieldEvaluation.findMany({
    where: { traineeId },
    orderBy: { fieldDate: "desc" },
    include: { categories: { select: { score: true } } },
  });

  return evaluations.map((e) => ({
    id: e.id,
    fieldDate: e.fieldDate,
    overallScore: averageScore(e.categories.map((c) => c.score)),
  }));
}
