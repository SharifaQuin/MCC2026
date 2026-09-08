import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Logo from "@/components/Logo";

const VALUES = [
  { label: "Hospitality First" },
  { label: "Trusted & Reliable" },
  { label: "Supportive Team" },
  { label: "Eco-Friendly Focus" },
];

export default async function CareersPage() {
  const postings = await prisma.jobPosting.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    select: { slug: true, titleEn: true, positionType: true },
  });

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200 px-4 py-4 sm:px-8">
        <Logo />
      </header>

      <section className="border-b border-brand-700 bg-brand-50 px-4 py-16 text-center sm:px-8">
        <p className="font-serif text-4xl italic text-gold-600 sm:text-5xl">Join</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-brand-700 sm:text-6xl">
          OUR CREW
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm font-semibold uppercase tracking-widest text-brand-500">
          Great People. Premium Service. Real Impact.
        </p>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
          {VALUES.map((v) => (
            <div key={v.label} className="flex flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold-400">
                <div className="h-3 w-3 rounded-full bg-gold-500" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                {v.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <h2 className="mb-6 text-center text-2xl font-bold text-brand-700">Open Positions</h2>

        {postings.length === 0 ? (
          <p className="text-center text-neutral-500">
            We don&apos;t have any open positions right now — check back soon!
          </p>
        ) : (
          <ul className="space-y-3">
            {postings.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/apply/${p.slug}`}
                  className="flex flex-col items-start justify-between gap-1 rounded-lg border border-neutral-200 p-5 transition hover:border-gold-400 hover:shadow-sm sm:flex-row sm:items-center"
                >
                  <span className="text-lg font-semibold text-brand-700">{p.titleEn}</span>
                  {p.positionType && (
                    <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-brand-600">
                      {p.positionType}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-neutral-200 bg-neutral-50 px-4 py-10 text-xs leading-relaxed text-neutral-500 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-3">
          <p className="font-semibold text-neutral-700">
            Application Disclaimer — Mama&apos;s Cleaning Crew
          </p>
          <p>
            By submitting an application, you acknowledge that Mama&apos;s Cleaning Crew expects
            all employees to uphold the highest standards of integrity, professionalism, and
            personal responsibility.
          </p>
          <p>
            Submitting an application does not create an employment contract. Employment with
            Mama&apos;s Cleaning Crew is at-will, meaning either you or the company may end the
            employment relationship at any time, with or without notice, for any lawful reason.
          </p>
          <p>
            Mama&apos;s Cleaning Crew is an Equal Opportunity Employer. We consider all applicants
            without regard to race, color, religion, sex, gender identity, sexual orientation,
            national origin, age, marital status, veteran status, disability, or any other status
            protected by law.
          </p>
        </div>
      </footer>
    </div>
  );
}
