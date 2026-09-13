import { prisma } from "@/lib/prisma";
import Logo from "@/components/Logo";
import ResumeUpload from "@/components/ResumeUpload";
import { submitApplicationAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  closed: "This position is no longer accepting applications.",
  incomplete: "Please fill out every field, attach your resume, and answer every question.",
  duplicate:
    "It looks like we already have an application on file from this email address for this position — we'll be in touch soon!",
};

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { error?: string };
}) {
  const posting = await prisma.jobPosting.findUnique({
    where: { slug: params.slug },
    include: { prescreenQuestions: { include: { options: true }, orderBy: { order: "asc" } } },
  });

  if (!posting || !posting.active) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Logo />
        <p className="mt-6 text-lg text-neutral-600">
          This position is no longer accepting applications. Check back soon for other openings!
        </p>
      </div>
    );
  }

  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-semibold text-neutral-900">{posting.titleEn}</h1>
      {posting.positionType && <p className="text-sm text-neutral-500">{posting.positionType}</p>}
      <p className="mt-4 whitespace-pre-wrap text-neutral-700">{posting.descriptionEn}</p>

      {errorMessage && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <form
        action={submitApplicationAction.bind(null, params.slug)}
        className="mt-8 space-y-5 rounded-lg border border-neutral-200 bg-white p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">First Name *</label>
            <input
              name="firstName"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Last Name *</label>
            <input
              name="lastName"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Email *</label>
            <input
              type="email"
              name="email"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Phone *</label>
            <input
              type="tel"
              name="phone"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
        </div>

        <ResumeUpload />

        {posting.prescreenQuestions.length > 0 && (
          <div className="space-y-5 border-t border-neutral-200 pt-5">
            <h2 className="text-lg font-medium text-neutral-900">A few quick questions</h2>
            {posting.prescreenQuestions.map((q, i) => (
              <div key={q.id}>
                <p className="mb-2 text-sm font-medium text-neutral-700">
                  {i + 1}. {q.textEn} *
                </p>
                <div className="space-y-2">
                  {q.options.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="radio"
                        name={`question_${q.id}`}
                        value={opt.id}
                        required
                        className="h-4 w-4"
                      />
                      {opt.textEn}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700"
        >
          Submit Application
        </button>
      </form>
    </div>
  );
}
