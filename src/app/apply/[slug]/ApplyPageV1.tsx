import Logo from "@/components/Logo";
import ResumeUpload from "@/components/ResumeUpload";
import { submitApplicationAction } from "./actions";

type Posting = {
  titleEn: string;
  positionType: string | null;
  descriptionEn: string;
  prescreenQuestions: {
    id: string;
    textEn: string;
    options: { id: string; textEn: string }[];
  }[];
};

// Recruiting V1 — the original mobile application form, preserved verbatim
// (moved out of page.tsx, not rewritten) so it stays reachable exactly as
// it was if the Recruiting Experience toggle is switched back to Draft 1.
export default function ApplyPageV1({
  posting,
  slug,
  src,
  errorMessage,
}: {
  posting: Posting;
  slug: string;
  src: string;
  errorMessage: string | null;
}) {
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
        action={submitApplicationAction.bind(null, slug)}
        className="mt-8 space-y-5 rounded-lg border border-neutral-200 bg-white p-6"
      >
        <input type="hidden" name="src" value={src} />
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
