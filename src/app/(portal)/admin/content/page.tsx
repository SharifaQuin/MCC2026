import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AddModuleForm from "./AddModuleForm";

export default async function AdminContentPage() {
  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { lessons: true, quizQuestions: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Content Editor</h1>

      <div className="mb-6 space-y-3">
        {modules.map((m) => (
          <Link
            key={m.id}
            href={`/admin/content/${m.slug}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Module {m.order}
              </p>
              <p className="font-medium">{m.titleEn}</p>
              <p className="text-xs text-neutral-500">
                {m._count.lessons} lessons · {m._count.quizQuestions} quiz questions
                {m.titleEs ? " · ES translated" : " · ES missing"}
              </p>
            </div>
            {!m.published && (
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">
                Unpublished
              </span>
            )}
          </Link>
        ))}
      </div>

      <AddModuleForm />
    </div>
  );
}
