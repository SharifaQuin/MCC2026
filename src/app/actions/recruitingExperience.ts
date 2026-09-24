"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  setRecruitingExperienceVersion,
  setRecruitingVideoUrl,
  type RecruitingExperienceVersion,
} from "@/lib/recruiting";

// The Draft 1 / Draft 2 careers-page toggle is deliberately ADMIN-only —
// stricter than the SERVICE_MANAGER-inclusive recruiting access most of
// this module uses — since flipping it changes what every visitor to the
// public careers page sees.
async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
}

export async function setRecruitingExperienceVersionAction(formData: FormData) {
  await requireAdmin();
  const version = String(formData.get("version") ?? "v1") as RecruitingExperienceVersion;
  await setRecruitingExperienceVersion(version === "v2" ? "v2" : "v1");
  revalidatePath("/recruiting/experience");
  revalidatePath("/careers");
}

export async function setRecruitingVideoUrlAction(formData: FormData) {
  await requireAdmin();
  const url = String(formData.get("videoUrl") ?? "").trim();
  await setRecruitingVideoUrl(url || null);
  revalidatePath("/recruiting/experience");
  revalidatePath("/careers");
}
