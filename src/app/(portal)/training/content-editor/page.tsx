import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTrainingContentEditAccess } from "@/lib/trainingContentAccess";
import { getTrainingExperienceVersion } from "@/lib/rookieJourney";

// Narrowly-scoped parallel to /admin/content (classic) and
// /admin/rookie-journey for a permitted non-admin editor (see
// src/lib/trainingContentAccess.ts) — middleware hard-blocks any non-ADMIN
// from /admin/content and /admin/rookie-journey at the edge, so this lives
// outside /admin entirely and re-checks the TRAINING_CONTENT_EDIT grant
// itself. No "Add Module"/"Add Content Card" and no transcript-seeding
// here — creating, deleting, reordering, assigning, and transcript seeding
// stay ADMIN-only, available only from the real admin editors.
//
// Branches on the active training mode: only the LIVE curriculum is ever
// shown here. Classic mode keeps the exact original catalog-list behavior;
// Rookie mode (the real state today) shows Days 1-10 instead and never the
// classic 25-module list.
export const dynamic = "force-dynamic";

export default async function TrainingContentEditorPage() {
  await requireTrainingContentEditAccess();
  const mode = await getTrainingExperienceVersion();

  if (mode === "rookie") {
    const days = await prisma.rookieDay.findMany({
      orderBy: { dayNumber: "asc" },
      include: { _count: { select: { lessons: true, contentItems: true } } },
    });

    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold">Training Content Editor</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Edit existing Rookie Day content — lesson text and condensed content cards — in the
          exact order a trainee sees it. Saving here changes published content immediately —
          there is no draft or approval step. Creating/deleting days or cards, assigning lessons,
          reordering, and field-skill administration are owner-only and aren&rsquo;t available here.
        </p>

        <div className="space-y-3">
          {days.map((d) => (
            <Link
              key={d.id}
              href={`/training/content-editor/day/${d.dayNumber}`}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Day {d.dayNumber}</p>
                <p className="font-medium">{d.titleEn}</p>
                <p className="text-xs text-neutral-500">
                  {d._count.lessons} assigned lesson{d._count.lessons === 1 ? "" : "s"} ·{" "}
                  {d._count.contentItems} content card{d._count.contentItems === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Classic — exact original behavior, now reached only while Classic is
  // the active training mode.
  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { lessons: true, quizQuestions: true } } },
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Training Content Editor</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Edit existing module/lesson text and quiz questions. Saving here changes published
        content immediately — there is no draft or approval step. Creating or deleting modules
        and lessons, publishing/unpublishing, and transcript seeding are owner-only and aren&rsquo;t
        available here.
      </p>

      <div className="space-y-3">
        {modules.map((m) => (
          <Link
            key={m.id}
            href={`/training/content-editor/${m.slug}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Module {m.order}
              </p>
              <p className="font-medium">{m.titleEn}</p>
              <p className="text-xs text-neutral-500">
                {m._count.lessons} lessons · {m._count.quizQuestions} quiz questions
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
    </div>
  );
}
