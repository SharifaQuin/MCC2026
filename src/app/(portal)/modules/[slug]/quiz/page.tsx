import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getModuleQuiz } from "@/lib/courses";
import { t } from "@/lib/i18n";
import QuizForm from "../QuizForm";

export default async function ModuleQuizPage({ params }: { params: { slug: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const labels = t(session.language);

  const quiz = await getModuleQuiz(params.slug, session.sub);
  if (!quiz) notFound();
  if (quiz.locked) redirect("/modules");
  if (!quiz.allLessonsCompleted) {
    redirect(`/modules/${params.slug}/lesson/${quiz.firstIncompleteOrder}`);
  }

  const lang = session.language;
  const title = lang === "ES" && quiz.module.titleEs ? quiz.module.titleEs : quiz.module.titleEn;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/modules/${params.slug}`}
          className="mb-3 inline-block text-sm text-brand-700 hover:underline"
        >
          {labels.backToModule}
        </Link>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{labels.startQuiz}</p>
      </div>

      <QuizForm
        moduleId={quiz.module.id}
        slug={params.slug}
        language={lang}
        questions={quiz.module.quizQuestions.map((q) => ({
          id: q.id,
          textEn: q.textEn,
          textEs: q.textEs,
          options: q.options.map((o) => ({ id: o.id, textEn: o.textEn, textEs: o.textEs })),
        }))}
      />
    </div>
  );
}
