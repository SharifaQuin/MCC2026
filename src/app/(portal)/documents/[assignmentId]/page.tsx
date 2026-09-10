import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOnboardingAssignmentDetail } from "@/lib/onboarding";
import { signOnboardingDocumentAction } from "../actions";

export default async function DocumentSignPage({
  params,
}: {
  params: { assignmentId: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const doc = await getOnboardingAssignmentDetail(params.assignmentId, session.sub);
  if (!doc) notFound();

  const action = signOnboardingDocumentAction.bind(null, doc.assignmentId);

  return (
    <div>
      <Link href="/documents" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
        ← Back to Documents
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">{doc.title}</h1>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        {doc.contentText && (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-neutral-800">
            {doc.contentText}
          </div>
        )}

        {doc.fileDataUrl && (
          <div className={doc.contentText ? "mt-6 border-t border-neutral-200 pt-6" : ""}>
            <iframe
              src={doc.fileDataUrl}
              title={doc.fileName ?? doc.title}
              className="h-[70vh] w-full rounded-md border border-neutral-200"
            />
          </div>
        )}

        {!doc.contentText && !doc.fileDataUrl && (
          <p className="text-sm text-neutral-500">This document has no content yet.</p>
        )}
      </div>

      {doc.signedAt ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Signed by <span className="font-medium">{doc.signedName}</span> on{" "}
          {new Date(doc.signedAt).toLocaleString()}.
        </div>
      ) : (
        <form action={action} className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Sign This Document
          </h2>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Type your full legal name to sign
          </label>
          <input
            type="text"
            name="signedName"
            defaultValue={session.name}
            required
            className="mb-4 w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <label className="mb-4 flex items-start gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="agreed" required className="mt-1 h-4 w-4" />
            <span>I have read and understand this document and agree to its terms.</span>
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Sign & Continue
          </button>
        </form>
      )}
    </div>
  );
}
