import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ModuleMetaForm from "./ModuleMetaForm";
import LessonEditor from "./LessonEditor";
import QuestionEditor from "./QuestionEditor";

export default async function AdminModuleEditorPage({ params }: { params: { slug: string } }) {
  const module = await prisma.module.findUnique({
    where: { slug: params.slug },
    include: {
      lessons: { orderBy: { order: "asc" } },
      quizQuestions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!module) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/content"
          className="mb-3 inline-block text-sm text-brand-700 hover:underline"
        >
          ← Back to Content Editor
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Module {module.order}
        </p>
        <h1 className="text-2xl font-semibold">{module.titleEn}</h1>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">Module Details</h2>
        <ModuleMetaForm
          moduleId={module.id}
          titleEn={module.titleEn}
          titleEs={module.titleEs}
          summaryEn={module.summaryEn}
          summaryEs={module.summaryEs}
          published={module.published}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Lessons</h2>
        <LessonEditor moduleId={module.id} slug={module.slug} lessons={module.lessons} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Quiz Questions</h2>
        <QuestionEditor moduleId={module.id} slug={module.slug} questions={module.quizQuestions} />
      </section>
    </div>
  );
}
