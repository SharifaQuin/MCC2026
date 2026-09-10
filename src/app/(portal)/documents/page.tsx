import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOnboardingDocumentsForUser } from "@/lib/onboarding";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const docs = await getOnboardingDocumentsForUser(session.sub);
  const pending = docs.filter((d) => !d.signedAt);
  const signed = docs.filter((d) => d.signedAt);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Documents</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {pending.length > 0
          ? "Please review and sign the documents below before you can start training."
          : "You're all caught up — nothing left to sign."}
      </p>

      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Needs Your Signature
          </h2>
          <div className="space-y-3">
            {pending.map((d) => (
              <Link
                key={d.assignmentId}
                href={`/documents/${d.assignmentId}`}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 hover:border-amber-300"
              >
                <span className="font-medium text-neutral-900">{d.title}</span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                  Sign Now →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {signed.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Signed
          </h2>
          <div className="space-y-3">
            {signed.map((d) => (
              <Link
                key={d.assignmentId}
                href={`/documents/${d.assignmentId}`}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
              >
                <span className="font-medium text-neutral-900">{d.title}</span>
                <span className="text-xs text-neutral-500">
                  Signed {d.signedAt ? new Date(d.signedAt).toLocaleDateString() : ""}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {docs.length === 0 && (
        <p className="text-sm text-neutral-500">No documents have been assigned to you yet.</p>
      )}
    </div>
  );
}
