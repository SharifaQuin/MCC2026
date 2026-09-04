import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getModuleDetail, markModuleInProgress } from "@/lib/courses";
import { t } from "@/lib/i18n";
import QuizForm from "./QuizForm";

export default async function ModuleDetailPage({ params }: { params: { slug: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const labels = t(session.language);

  const detail = await getModuleDetail(params.slug, session.sub);
  if (!detail) notFound();
  if (detail.locked) redirect("/modules");

  await markModuleInProgress(session.sub, detail.module.id);

  const lang = session.language;
  const title = lang === "ES" && detail.module.titleEs ? detail.module.titleEs : detail.module.titleEn;

  return (
    <div className="space-y-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Module {detail.module.order}
        </p>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>

      <div className="space-y-6">
        {detail.module.lessons.map((lesson, i) => {
          const lTitle = lang === "ES" && lesson.titleEs ? lesson.titleEs : lesson.titleEn;
          const lContent = lang === "ES" && lesson.contentEs ? lesson.contentEs : lesson.contentEn;
          return (
            <div key={lesson.id} className="rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="mb-2 font-medium">
                {i + 1}. {lTitle}
              </h2>
              {lesson.videoUrl ? (
                <div className="mb-3 aspect-video w-full overflow-hidden rounded-md bg-black">
                  <iframe
                    src={lesson.videoUrl}
                    className="h-full w-full"
                    allowFullScreen
                    title={lTitle}
                  />
                </div>
              ) : (
                <p className="mb-3 text-xs italic text-neutral-400">
                  Video coming soon — Paste YouTube link once uploaded.
                </p>
              )}
              <p className="whitespace-pre-line text-sm text-neutral-700">{lContent}</p>
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">{labels.startQuiz}</h2>
        <QuizForm
          moduleId={detail.module.id}
          slug={params.slug}
          language={lang}
          questions={detail.module.quizQuestions.map((q) => ({
            id: q.id,
            textEn: q.textEn,
            textEs: q.textEs,
            options: q.options.map((o) => ({ id: o.id, textEn: o.textEn, textEs: o.textEs })),
          }))}
        />
      </div>
    </div>
  );
}
