import { prisma } from "@/lib/prisma";
import { averageScore } from "@/lib/fieldEval";

export async function loadEmployeeExportRows() {
  const totalModules = await prisma.module.count({ where: { published: true } });

  const employees = await prisma.user.findMany({
    where: { role: "TRAINEE" },
    orderBy: { createdAt: "asc" },
    include: {
      progress: { where: { status: "COMPLETED" } },
      quizAttempts: { select: { scorePct: true } },
      fieldEvaluationsReceived: {
        include: { categories: { select: { score: true } } },
      },
    },
  });

  return employees.map((e) => {
    const bestQuizScore = e.quizAttempts.reduce<number | null>(
      (best, a) => (best === null || a.scorePct > best ? a.scorePct : best),
      null
    );
    const fieldEvalScores = e.fieldEvaluationsReceived.flatMap((ev) =>
      ev.categories.map((c) => c.score)
    );

    return {
      name: e.name,
      email: e.email,
      status: !e.active ? "Deactivated" : e.mustSetPassword ? "Invite Pending" : "Active",
      modulesCompleted: e.progress.length,
      totalModules,
      bestQuizScorePct: bestQuizScore,
      fieldEvaluationCount: e.fieldEvaluationsReceived.length,
      avgFieldEvalScore: averageScore(fieldEvalScores),
      certificationStatus: e.certificationStatus,
      invitedAt: e.createdAt,
      lastLoginAt: e.lastLoginAt,
      certifiedAt: e.certificationStatus === "CERTIFIED" ? e.certDecidedAt : null,
    };
  });
}

function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function buildEmployeeExportCsv(): Promise<string> {
  const rows = await loadEmployeeExportRows();

  const headers = [
    "Name",
    "Email",
    "Status",
    "Modules Completed",
    "Total Modules",
    "Best Quiz Score %",
    "Field Evaluations Logged",
    "Avg Field Eval Score (/5)",
    "Certification Status",
    "Invited",
    "Last Login",
    "Certified On",
  ];

  const lines = [headers.join(",")];

  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.name),
        csvEscape(r.email),
        csvEscape(r.status),
        csvEscape(r.modulesCompleted),
        csvEscape(r.totalModules),
        csvEscape(r.bestQuizScorePct),
        csvEscape(r.fieldEvaluationCount),
        csvEscape(r.avgFieldEvalScore),
        csvEscape(r.certificationStatus),
        csvEscape(r.invitedAt.toISOString().slice(0, 10)),
        csvEscape(r.lastLoginAt ? r.lastLoginAt.toISOString().slice(0, 10) : ""),
        csvEscape(r.certifiedAt ? r.certifiedAt.toISOString().slice(0, 10) : ""),
      ].join(",")
    );
  }

  return lines.join("\n");
}
