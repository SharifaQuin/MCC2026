import { prisma } from "@/lib/prisma";
import { FIELD_EVAL_CATEGORIES, averageScore } from "@/lib/fieldEval";

export async function loadAdminDashboard() {
  const totalModules = await prisma.module.count({ where: { published: true } });

  const employees = await prisma.user.findMany({
    where: { role: "TRAINEE" },
    include: {
      progress: { where: { status: "COMPLETED" } },
    },
  });

  const totalEmployees = employees.length;
  const pendingInvites = employees.filter((e) => e.active && e.mustSetPassword).length;
  const deactivated = employees.filter((e) => !e.active).length;
  const activeEmployees = employees.filter((e) => e.active && !e.mustSetPassword);

  const completedAll = activeEmployees.filter(
    (e) => totalModules > 0 && e.progress.length === totalModules
  ).length;
  const notStarted = activeEmployees.filter((e) => e.progress.length === 0).length;
  const inTraining = activeEmployees.length - completedAll - notStarted;

  const recentEvaluations = await prisma.fieldEvaluation.count({
    where: { fieldDate: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) } },
  });

  const certifiedCount = employees.filter((e) => e.certificationStatus === "CERTIFIED").length;

  const daysToCertify = employees
    .filter((e) => e.certificationStatus === "CERTIFIED" && e.certDecidedAt)
    .map((e) => (e.certDecidedAt!.getTime() - e.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const avgDaysToCertify =
    daysToCertify.length > 0
      ? Math.round((daysToCertify.reduce((a, b) => a + b, 0) / daysToCertify.length) * 10) / 10
      : null;
  const pendingCertifications = await prisma.user.findMany({
    where: { role: "TRAINEE", certificationStatus: "PENDING" },
    select: { id: true, name: true, certRecommendedAt: true },
    orderBy: { certRecommendedAt: "asc" },
  });

  const sevenDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const stalledEmployees = activeEmployees
    .filter(
      (e) =>
        e.certificationStatus !== "CERTIFIED" &&
        (!e.lastLoginAt || e.lastLoginAt < sevenDaysAgo)
    )
    .map((e) => ({ id: e.id, name: e.name, lastLoginAt: e.lastLoginAt }))
    .sort((a, b) => (a.lastLoginAt?.getTime() ?? 0) - (b.lastLoginAt?.getTime() ?? 0));

  const allCategoryScores = await prisma.fieldEvalCategoryScore.findMany({
    select: { categoryKey: true, score: true },
  });

  const orgFocusAreas = FIELD_EVAL_CATEGORIES.map((def) => {
    const scores = allCategoryScores.filter((c) => c.categoryKey === def.key).map((c) => c.score);
    return {
      key: def.key,
      label: def.label,
      relatedModuleTitles: def.relatedModuleTitles,
      average: averageScore(scores),
      entryCount: scores.length,
    };
  }).filter((c) => c.average !== null && c.average < 3);

  return {
    totalEmployees,
    pendingInvites,
    deactivated,
    completedAll,
    inTraining,
    notStarted,
    recentEvaluations,
    orgFocusAreas,
    certifiedCount,
    pendingCertifications,
    avgDaysToCertify,
    stalledEmployees,
  };
}
