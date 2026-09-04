"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { submitQuizAttempt } from "@/lib/courses";

export interface QuizState {
  scorePct?: number;
  passed?: boolean;
  submitted?: boolean;
  error?: string;
}

export async function submitQuizAction(
  moduleId: string,
  questionIds: string[],
  slug: string,
  _prevState: QuizState,
  formData: FormData
): Promise<QuizState> {
  const session = await getSession();
  if (!session) return { error: "Not logged in." };

  const answers: Record<string, string> = {};
  for (const qid of questionIds) {
    const val = formData.get(`q_${qid}`);
    if (typeof val === "string") answers[qid] = val;
  }

  if (Object.keys(answers).length < questionIds.length) {
    return { error: "Please answer every question before submitting." };
  }

  const result = await submitQuizAttempt(session.sub, moduleId, answers);
  revalidatePath(`/modules/${slug}`);
  revalidatePath("/modules");
  revalidatePath("/progress");

  return { ...result, submitted: true };
}
