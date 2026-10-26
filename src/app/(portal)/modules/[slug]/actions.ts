"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { submitQuizAttempt } from "@/lib/courses";
import { getAreaAccessForUser } from "@/lib/officeAssistant";

export interface QuestionResult {
  questionId: string;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  correct: boolean;
}

export interface QuizState {
  scorePct?: number;
  passed?: boolean;
  submitted?: boolean;
  results?: QuestionResult[];
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
  // Mirrors the server-side Training-grant check enforced on the quiz page
  // itself — rejects a direct call from an Office Assistant whose Training
  // grant was revoked, even for a quiz page already open in their browser.
  if (session.role === "OFFICE_ASSISTANT") {
    const access = await getAreaAccessForUser(session.sub, "TRAINING");
    if (!access.canView) return { error: "Not authorized." };
  }

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
