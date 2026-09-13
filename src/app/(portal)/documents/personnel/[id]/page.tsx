import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSignedDocumentForSigning } from "@/lib/documentTemplates";
import SignDocumentForm from "@/components/SignDocumentForm";

export default async function PersonnelDocumentSignPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const doc = await getSignedDocumentForSigning(params.id, session.sub);
  if (!doc) notFound();

  return (
    <div>
      <Link href="/documents" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
        ← Back to Documents
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">{doc.title}</h1>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-neutral-800">{doc.renderedBody}</div>
      </div>

      {doc.signedAt ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p>
            Signed by <span className="font-medium">{doc.signedName}</span> on{" "}
            {new Date(doc.signedAt).toLocaleString()}.
          </p>
        </div>
      ) : (
        <SignDocumentForm documentId={doc.id} defaultName={session.name} />
      )}

      {doc.pdfDataUrl && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium text-neutral-700">Signed PDF</p>
          <iframe
            src={doc.pdfDataUrl}
            title={`${doc.title} (signed PDF)`}
            className="h-[70vh] w-full rounded-md border border-neutral-200"
          />
        </div>
      )}
    </div>
  );
}
