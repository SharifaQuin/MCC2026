"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
  return session;
}

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `module-${Date.now()}`
  );
}

export async function createModuleAction(formData: FormData) {
  await requireAdmin();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  if (!titleEn) return;

  const count = await prisma.module.count();
  let slug = slugify(titleEn);
  const existing = await prisma.module.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${count + 1}`;

  const mod = await prisma.module.create({
    data: { titleEn, slug, order: count + 1 },
  });

  revalidatePath("/admin/content");
  return mod.slug;
}

export async function updateModuleMetaAction(moduleId: string, formData: FormData) {
  await requireAdmin();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  const titleEs = String(formData.get("titleEs") ?? "").trim();
  const summaryEn = String(formData.get("summaryEn") ?? "").trim();
  const summaryEs = String(formData.get("summaryEs") ?? "").trim();
  const published = formData.get("published") === "on";

  const mod = await prisma.module.update({
    where: { id: moduleId },
    data: {
      titleEn,
      titleEs: titleEs || null,
      summaryEn: summaryEn || null,
      summaryEs: summaryEs || null,
      published,
    },
  });

  revalidatePath(`/admin/content/${mod.slug}`);
  revalidatePath("/admin/content");
  revalidatePath("/modules");
}

export async function deleteModuleAction(moduleId: string) {
  await requireAdmin();
  await prisma.module.delete({ where: { id: moduleId } });
  revalidatePath("/admin/content");
  revalidatePath("/modules");
}

export async function createLessonAction(moduleId: string, slug: string) {
  await requireAdmin();
  const count = await prisma.lesson.count({ where: { moduleId } });
  await prisma.lesson.create({
    data: { moduleId, order: count + 1, titleEn: "New Lesson", contentEn: "" },
  });
  revalidatePath(`/admin/content/${slug}`);
}

export async function updateLessonAction(lessonId: string, slug: string, formData: FormData) {
  await requireAdmin();
  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      titleEn: String(formData.get("titleEn") ?? ""),
      titleEs: String(formData.get("titleEs") ?? "") || null,
      contentEn: String(formData.get("contentEn") ?? ""),
      contentEs: String(formData.get("contentEs") ?? "") || null,
      videoUrl: String(formData.get("videoUrl") ?? "") || null,
    },
  });
  revalidatePath(`/admin/content/${slug}`);
  revalidatePath("/modules");
}

export async function deleteLessonAction(lessonId: string, slug: string) {
  await requireAdmin();
  await prisma.lesson.delete({ where: { id: lessonId } });
  revalidatePath(`/admin/content/${slug}`);
}

export async function createQuestionAction(moduleId: string, slug: string) {
  await requireAdmin();
  const count = await prisma.quizQuestion.count({ where: { moduleId } });
  const question = await prisma.quizQuestion.create({
    data: { moduleId, order: count + 1, textEn: "New question" },
  });
  await prisma.quizOption.createMany({
    data: [0, 1, 2, 3].map((i) => ({
      questionId: question.id,
      order: i + 1,
      textEn: "",
      isCorrect: i === 0,
    })),
  });
  revalidatePath(`/admin/content/${slug}`);
}

export async function updateQuestionAction(
  questionId: string,
  slug: string,
  formData: FormData
) {
  await requireAdmin();
  const textEn = String(formData.get("textEn") ?? "");
  const textEs = String(formData.get("textEs") ?? "") || null;
  const correctOptionId = String(formData.get("correctOptionId") ?? "");

  await prisma.quizQuestion.update({
    where: { id: questionId },
    data: { textEn, textEs },
  });

  const options = await prisma.quizOption.findMany({ where: { questionId } });
  for (const option of options) {
    const textEnOpt = String(formData.get(`option_${option.id}_en`) ?? "");
    const textEsOpt = String(formData.get(`option_${option.id}_es`) ?? "") || null;
    await prisma.quizOption.update({
      where: { id: option.id },
      data: {
        textEn: textEnOpt,
        textEs: textEsOpt,
        isCorrect: option.id === correctOptionId,
      },
    });
  }

  revalidatePath(`/admin/content/${slug}`);
  revalidatePath("/modules");
}

export async function deleteQuestionAction(questionId: string, slug: string) {
  await requireAdmin();
  await prisma.quizQuestion.delete({ where: { id: questionId } });
  revalidatePath(`/admin/content/${slug}`);
}
