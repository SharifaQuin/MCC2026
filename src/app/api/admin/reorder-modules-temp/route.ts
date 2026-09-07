import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const NEW_ORDER: Record<string, number> = {
  "who-we-are": 1,
  "company-terminology-definitions": 2,
  "apps-we-use-daily": 3,
  "a-day-in-the-life": 4,
  "golden-rules-of-cleaning": 5,
  "working-in-teams-working-solo": 6,
  "lead-technician-role-authority": 7,
  "taking-care-of-you": 8,
  "attendance-workplace-policies": 9,
  "workplace-conduct-performance-expectations": 10,
  "pay-structure": 11,
  "incentive-rewards-program": 12,
  "meal-rest-break-policy": 13,
  "mcc-dirt-code-system": 14,
  "supplies-tools-safety": 15,
  "field-scenarios-office-communication": 16,
  "how-to-clean-a-bathroom": 17,
  "how-to-clean-a-kitchen": 18,
  "living-area-and-bedrooms": 19,
  "client-communication-and-etiquette": 20,
  "advanced-cleaning-and-technique": 21,
  "time-management-and-travel-efficiency": 22,
  "deep-cleaning-and-specialty-tasks": 23,
  "uniform-standard-policy": 24,
  "company-policies-job-site-basics": 25,
};

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const before = await prisma.module.findMany({
    select: { slug: true, order: true },
    orderBy: { order: "asc" },
  });

  // Shift everything to a safe temporary range first to avoid any transient
  // collisions while reassigning final order values.
  await Promise.all(
    before.map((m, i) =>
      prisma.module.update({ where: { slug: m.slug }, data: { order: 1000 + i } })
    )
  );

  const results = [];
  for (const [slug, order] of Object.entries(NEW_ORDER)) {
    const updated = await prisma.module.update({
      where: { slug },
      data: { order },
    });
    results.push({ slug: updated.slug, order: updated.order });
  }

  const after = await prisma.module.findMany({
    select: { slug: true, order: true, titleEn: true },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({ before, after });
}
