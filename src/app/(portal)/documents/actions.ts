"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function signOnboardingDocumentAction(assignmentId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const signedName = String(formData.get("signedName") ?? "").trim();
  const agreed = formData.get("agreed") === "on";
  if (!signedName || !agreed) return;

  const assignment = await prisma.onboardingAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.userId !== session.sub) return;

  await prisma.onboardingAssignment.update({
    where: { id: assignmentId },
    data: { signedAt: new Date(), signedName },
  });

  revalidatePath("/documents");
  revalidatePath(`/documents/${assignmentId}`);
  redirect("/documents");
}
