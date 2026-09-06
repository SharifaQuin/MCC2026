import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Playfair_Display, Dancing_Script } from "next/font/google";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CERT_SIGNERS } from "@/lib/certificate";
import PrintButton from "./PrintButton";

const headline = Playfair_Display({ subsets: ["latin"], weight: ["700", "900"] });
const script = Dancing_Script({ subsets: ["latin"], weight: ["700"] });

export default async function CertificatePage({ params }: { params: { userId: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const isSelf = session.sub === params.userId;
  if (session.role !== "ADMIN" && !isSelf) redirect("/");

  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user || user.certificationStatus !== "CERTIFIED") notFound();

  const certifiedDate = user.certDecidedAt
    ? new Date(user.certDecidedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  const backHref = session.role === "ADMIN" ? `/admin/employees/${user.id}` : "/progress";

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-8 print:bg-white print:p-0">
      <style>{`@media print { @page { size: landscape; margin: 0.3in; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between print:hidden">
        <Link href={backHref} className="text-sm text-brand-700 hover:underline">
          ← Back
        </Link>
        <PrintButton />
      </div>

      <div className="relative mx-auto max-w-4xl overflow-hidden border-[6px] border-gold-500 bg-white shadow-lg print:max-w-none print:border-[4px] print:shadow-none">
        <div
          className="pointer-events-none absolute left-0 top-0 h-28 w-28 bg-brand-700"
          style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        />
        <div
          className="pointer-events-none absolute left-0 top-0 h-32 w-32 border-b-[3px] border-gold-500"
          style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-28 w-28 bg-brand-700"
          style={{ clipPath: "polygon(100% 100%, 100% 0, 0 100%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-32 w-32 border-t-[3px] border-gold-500"
          style={{ clipPath: "polygon(100% 100%, 100% 0, 0 100%)" }}
        />

        <div className="relative flex flex-col items-center px-10 py-12 text-center sm:px-16">
          <h1
            className={`${headline.className} text-4xl font-black tracking-wide text-brand-800 sm:text-5xl`}
          >
            CERTIFICATE
          </h1>
          <p
            className={`${headline.className} mt-2 flex items-center gap-3 text-lg font-bold tracking-[0.3em] text-gold-600 sm:text-xl`}
          >
            <span className="h-px w-8 bg-gold-500 sm:w-10" /> OF ACHIEVEMENT{" "}
            <span className="h-px w-8 bg-gold-500 sm:w-10" />
          </p>

          <p className="mt-8 text-sm text-neutral-600">This certificate is proudly presented to</p>

          <div className="relative mt-3 bg-brand-700 px-10 py-3">
            <p className="text-xl font-semibold text-white sm:text-2xl">{user.name}</p>
          </div>

          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-neutral-600">
            This certificate is proudly awarded to cleaning technicians who have successfully
            completed the Mama&apos;s Cleaning Crew training program. This achievement demonstrates
            their exceptional competence and unwavering dedication as professional cleaning
            technicians. Congratulations on your accomplishment!
          </p>

          <div className="mt-10 flex w-full max-w-lg items-end justify-between gap-4">
            <div className="flex-1 text-center">
              <p className={`${script.className} text-2xl text-brand-800`}>
                {CERT_SIGNERS.first.name}
              </p>
              <div className="mt-1 border-t border-neutral-400" />
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gold-600">
                {CERT_SIGNERS.first.name}
              </p>
              <p className="text-xs text-neutral-500">{CERT_SIGNERS.first.title}</p>
            </div>

            <svg width="60" height="60" viewBox="0 0 100 100" aria-hidden className="shrink-0">
              <circle cx="50" cy="50" r="46" fill="none" stroke="#C9A227" strokeWidth="3" />
              <circle cx="50" cy="50" r="38" fill="#1B2A4A" />
              <path
                d="M32 58 L32 40 L50 26 L68 40 L68 58"
                stroke="#C9A227"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M50 54 C44 48 38 45 38 38 C38 34 42 32 45 35 C47 37 50 39 50 39 C50 39 53 37 55 35 C58 32 62 34 62 38 C62 45 56 48 50 54 Z"
                fill="#C9A227"
              />
            </svg>

            <div className="flex-1 text-center">
              <p className={`${script.className} text-2xl text-brand-800`}>
                {CERT_SIGNERS.second.name}
              </p>
              <div className="mt-1 border-t border-neutral-400" />
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gold-600">
                {CERT_SIGNERS.second.name}
              </p>
              <p className="text-xs text-neutral-500">{CERT_SIGNERS.second.title}</p>
            </div>
          </div>

          {certifiedDate && (
            <p className="mt-6 text-xs text-neutral-400">Certified {certifiedDate}</p>
          )}
        </div>
      </div>
    </div>
  );
}
