import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

interface SeedOption {
  order: number;
  textEn: string;
  textEs: string | null;
}
interface SeedQuestion {
  order: number;
  textEn: string;
  textEs: string | null;
  correctIndex: number;
  options: SeedOption[];
}
interface SeedLesson {
  order: number;
  titleEn: string;
  titleEs: string | null;
  contentEn: string;
  contentEs: string | null;
  videoUrl: string | null;
}
interface SeedModule {
  order: number;
  slug: string;
  titleEn: string;
  titleEs: string | null;
  lessons: SeedLesson[];
  quiz: SeedQuestion[];
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = process.env.ADMIN_NAME ?? "Admin";
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("Skipping admin seed — ADMIN_EMAIL / ADMIN_PASSWORD not set.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      name,
      role: "ADMIN",
      passwordHash,
      mustSetPassword: false,
    },
  });
  console.log(`Created admin account: ${email}`);
}

async function seedModules() {
  const filePath = path.join(__dirname, "content", "modules.json");
  const modules: SeedModule[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  for (const mod of modules) {
    const existing = await prisma.module.findUnique({ where: { slug: mod.slug } });
    if (existing) {
      console.log(`Module "${mod.titleEn}" already exists, skipping (edit it in the admin content editor instead).`);
      continue;
    }

    await prisma.module.create({
      data: {
        slug: mod.slug,
        order: mod.order,
        titleEn: mod.titleEn,
        titleEs: mod.titleEs,
        lessons: {
          create: mod.lessons.map((l) => ({
            order: l.order,
            titleEn: l.titleEn,
            titleEs: l.titleEs,
            contentEn: l.contentEn,
            contentEs: l.contentEs,
            videoUrl: l.videoUrl,
          })),
        },
        quizQuestions: {
          create: mod.quiz.map((q) => ({
            order: q.order,
            textEn: q.textEn,
            textEs: q.textEs,
            options: {
              create: q.options.map((o, i) => ({
                order: o.order,
                textEn: o.textEn,
                textEs: o.textEs,
                isCorrect: i === q.correctIndex,
              })),
            },
          })),
        },
      },
    });
    console.log(`Seeded module: ${mod.titleEn}`);
  }
}

async function main() {
  await seedAdmin();
  await seedModules();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
