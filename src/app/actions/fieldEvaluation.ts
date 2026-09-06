"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { FIELD_EVAL_CATEGORIES } from "@/lib/fieldEval";

export interface FieldEvalState {
  error?: string;
  success?: boolean;
}

async function requireAdminOrTrainer() {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "ADMIN" && session.role !== "TRAINER" && session.role !== "SERVICE_MANAGER")
  ) {
    throw new Error("Not authorized");
  }
  return session;
}

function parseCategoryData(formData: FormData) {
  return FIELD_EVAL_CATEGORIES.map((cat) => {
    const scoreRaw = formData.get(`score_${cat.key}`);
    const score = scoreRaw ? parseInt(String(scoreRaw), 10) : null;
    const notes = String(formData.get(`notes_${cat.key}`) ?? "").trim() || null;
    const checkedItems = cat.checklistItems.filter(
      (_, i) => formData.get(`check_${cat.key}_${i}`) === "on"
    );
    return { categoryKey: cat.key, score, notes, checkedItems };
  });
}

function revalidateTraineeViews(traineeId: string) {
  revalidatePath(`/admin/employees/${traineeId}`);
  revalidatePath(`/trainer/employees/${traineeId}`);
  revalidatePath("/progress");
}

export async function createFieldEvaluationAction(
  traineeId: string,
  _prevState: FieldEvalState,
  formData: FormData
): Promise<FieldEvalState> {
  let session;
  try {
    session = await requireAdminOrTrainer();
  } catch {
    return { error: "Not authorized." };
  }

  const fieldDateRaw = String(formData.get("fieldDate") ?? "");
  const fieldDate = fieldDateRaw ? new Date(fieldDateRaw) : new Date();
  const generalNotes = String(formData.get("generalNotes") ?? "").trim() || null;
  const categoryData = parseCategoryData(formData);

  if (categoryData.some((c) => c.score === null || c.score < 1 || c.score > 5)) {
    return { error: "Please give every category a score from 1 to 5." };
  }

  await prisma.fieldEvaluation.create({
    data: {
      traineeId,
      gradedById: session.sub,
      fieldDate,
      generalNotes,
      categories: {
        create: categoryData.map((c) => ({
          categoryKey: c.categoryKey,
          score: c.score as number,
          notes: c.notes,
          checkedItems: c.checkedItems,
        })),
      },
    },
  });

  revalidateTraineeViews(traineeId);

  return { success: true };
}

export async function updateFieldEvaluationAction(
  evaluationId: string,
  traineeId: string,
  _prevState: FieldEvalState,
  formData: FormData
): Promise<FieldEvalState> {
  try {
    await requireAdminOrTrainer();
  } catch {
    return { error: "Not authorized." };
  }

  const fieldDateRaw = String(formData.get("fieldDate") ?? "");
  const fieldDate = fieldDateRaw ? new Date(fieldDateRaw) : new Date();
  const generalNotes = String(formData.get("generalNotes") ?? "").trim() || null;
  const categoryData = parseCategoryData(formData);

  if (categoryData.some((c) => c.score === null || c.score < 1 || c.score > 5)) {
    return { error: "Please give every category a score from 1 to 5." };
  }

  await prisma.fieldEvaluation.update({
    where: { id: evaluationId },
    data: {
      fieldDate,
      generalNotes,
      categories: {
        deleteMany: {},
        create: categoryData.map((c) => ({
          categoryKey: c.categoryKey,
          score: c.score as number,
          notes: c.notes,
          checkedItems: c.checkedItems,
        })),
      },
    },
  });

  revalidateTraineeViews(traineeId);

  return { success: true };
}

export async function deleteFieldEvaluationAction(evaluationId: string, traineeId: string) {
  await requireAdminOrTrainer();
  await prisma.fieldEvaluation.delete({ where: { id: evaluationId } });
  revalidateTraineeViews(traineeId);
}
