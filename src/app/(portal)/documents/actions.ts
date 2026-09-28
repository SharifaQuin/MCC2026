"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { stampOnboardingSignature } from "@/lib/documentPdf";

// Best-effort — Railway (like most hosts) sits behind a proxy, so the real
// client IP arrives via x-forwarded-for rather than the raw socket address.
function getClientIp(headerList: ReturnType<typeof headers>): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headerList.get("x-real-ip");
}

export async function signOnboardingDocumentAction(assignmentId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const signedName = String(formData.get("signedName") ?? "").trim();
  const agreed = formData.get("agreed") === "on";
  if (!signedName || !agreed) return;

  const assignment = await prisma.onboardingAssignment.findUnique({
    where: { id: assignmentId },
    include: { document: true },
  });
  if (!assignment || assignment.userId !== session.sub) return;
  // Already signed — the record is permanent, never re-generate or overwrite it.
  if (assignment.signedAt) return;

  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { name: true, email: true } });
  const signedAt = new Date();
  const headerList = headers();

  const signedPdfDataUrl = await stampOnboardingSignature({
    title: assignment.document.title,
    contentText: assignment.document.contentText,
    originalFileDataUrl: assignment.document.fileDataUrl,
    employeeName: user?.name ?? session.name,
    employeeEmail: user?.email ?? "",
    signedName,
    signedAt,
    ipAddress: getClientIp(headerList),
    userAgent: headerList.get("user-agent"),
  });

  await prisma.onboardingAssignment.update({
    where: { id: assignmentId },
    data: { signedAt, signedName, signedPdfDataUrl },
  });

  revalidatePath("/documents");
  revalidatePath(`/documents/${assignmentId}`);
  redirect("/documents");
}
