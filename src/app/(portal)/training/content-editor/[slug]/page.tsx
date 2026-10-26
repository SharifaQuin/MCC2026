import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTrainingContentEditAccess } from "@/lib/trainingContentAccess";
import { loadQuizMissRates } from "@/lib/quizStats";
import ModuleMetaForm from "@/app/(portal)/admin/content/[slug]/ModuleMetaForm";
import LessonEditor from "@/app/(portal)/admin/content/[slug]/LessonEditor";
import QuestionEditor from "@/app/(portal)/admin/content/[slug]/QuestionEditor";

// Reuses the exact same editor components and save actions as the ADMIN-only
// /admin/content/[slug] route — the permission check below (re-run on every
// load, never cached) and the `canAdminister` prop passed to each component
// are what differ. requireTrainingContentEditAccess() checks ADMIN OR a
// granted TRAINING_CONTENT_EDIT row; the save actions re-check the identical
// permission server-side on every submit, so revoking it blocks the next
// save even in a tab that's already open here.
export const dynamic = "force-dynamic";

export default async function TrainingContentEditorModulePage({ params }: { params: { slug: string } }) {
  const { isAdmin } = await requireTrainingContentEditAccess();

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

  const missRates = await loadQuizMissRates(module.id);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/training/content-editor"
          className="mb-3 inline-block text-sm text-brand-700 hover:underline"
        >
          ← Back to Training Content Editor
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
          updatedAt={module.updatedAt.toISOString()}
          canAdminister={isAdmin}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Lessons</h2>
        <LessonEditor
          moduleId={module.id}
          slug={module.slug}
          lessons={module.lessons.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() }))}
          canAdminister={isAdmin}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Quiz Questions</h2>
        <QuestionEditor
          moduleId={module.id}
          slug={module.slug}
          questions={module.quizQuestions.map((q) => ({ ...q, updatedAt: q.updatedAt.toISOString() }))}
          missRates={missRates}
          canAdminister={isAdmin}
        />
      </section>
    </div>
  );
}
