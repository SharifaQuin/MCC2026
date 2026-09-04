"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, setSessionCookie, Language } from "@/lib/session";

export async function setLanguageAction(language: Language) {
  const session = await getSession();
  if (!session) return;

  await prisma.user.update({
    where: { id: session.sub },
    data: { language },
  });

  await setSessionCookie({ ...session, language });
  revalidatePath("/", "layout");
}
