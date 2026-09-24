import Link from "next/link";
import { SectionContainer } from "@/components/ds/Card";
import Button from "@/components/ds/Button";
import Logo from "@/components/Logo";
import type { CareersV2Content, CareersLocale } from "@/lib/recruiting";

// Recruiting 2.0's careers landing page. All candidate-facing copy comes
// from the `content` prop (see getCareersV2Content in src/lib/recruiting.ts)
// so it's Admin-editable at /recruiting/careers-content without a code
// change — this file only owns layout/structure and the small set of
// fixed structural labels (MAMAS letters, career ladder roles, At a
// Glance field labels, section headings).

// The MAMAS letters/words are a branded acronym tied to the company name
// ("Mama's") — kept in English in both locales rather than translated,
// the same way a brand name itself isn't translated. Only their
// descriptions (in `content`) are localized.
const MAMAS_LETTERS: { letter: string; word: string }[] = [
  { letter: "M", word: "Meticulous" },
  { letter: "A", word: "Authentic" },
  { letter: "M", word: "Mindful" },
  { letter: "A", word: "Allegiant" },
  { letter: "S", word: "Sincere" },
];

// Fixed section headings and small labels that aren't part of the
// Admin-editable `content` blob — translated here since they're still
// candidate-facing text, just not sentences Shar would want to rewrite.
const UI_STRINGS: Record<
  CareersLocale,
  {
    careerLadder: string[];
    ourStoryHeading: string;
    videoHeading: string;
    jobDescriptionHeading: string;
    whyWorkHeading: string;
    jobPreviewHeading: string;
    jobPreviewAlsoLabel: string;
    careerGrowthHeading: string;
    mamasHeading: string;
    openPositionsHeading: string;
    noOpenPositions: string;
    applyNow: string;
    faqHeading: string;
  }
> = {
  en: {
    careerLadder: ["Cleaning Technician", "Lead Technician", "Trainer", "Field Supervisor", "Service Manager"],
    ourStoryHeading: "Our Story",
    videoHeading: "See What It's Like to Work at Mama's",
    jobDescriptionHeading: "The Cleaning Technician Position",
    whyWorkHeading: "Why Work at Mama's",
    jobPreviewHeading: "What the Job Actually Involves",
    jobPreviewAlsoLabel: "You'll also:",
    careerGrowthHeading: "Grow With Mama's",
    mamasHeading: "The MAMAS Way",
    openPositionsHeading: "Open Positions",
    noOpenPositions: "We don't have any open positions right now — check back soon!",
    applyNow: "Apply Now",
    faqHeading: "Questions? We've Got Answers.",
  },
  es: {
    careerLadder: ["Técnico de Limpieza", "Técnico Líder", "Capacitador(a)", "Supervisor(a) de Campo", "Gerente de Servicio"],
    ourStoryHeading: "Nuestra Historia",
    videoHeading: "Mira Cómo Es Trabajar en Mama's",
    jobDescriptionHeading: "La Posición de Técnico de Limpieza",
    whyWorkHeading: "Por Qué Trabajar en Mama's",
    jobPreviewHeading: "Lo Que Realmente Implica el Trabajo",
    jobPreviewAlsoLabel: "También vas a:",
    careerGrowthHeading: "Crece con Mama's",
    mamasHeading: "El Camino MAMAS",
    openPositionsHeading: "Posiciones Disponibles",
    noOpenPositions: "No tenemos posiciones disponibles en este momento — ¡vuelve a revisar pronto!",
    applyNow: "Postularme",
    faqHeading: "¿Preguntas? Tenemos Respuestas.",
  },
};

export default function CareersPageV2({
  postings,
  videoUrl,
  content,
  locale,
}: {
  postings: { slug: string; titleEn: string; positionType: string | null; descriptionEn: string }[];
  videoUrl: string | null;
  content: CareersV2Content;
  locale: CareersLocale;
}) {
  const t = UI_STRINGS[locale];
  const atAGlance = [
    { label: "Schedule", value: content.atAGlance.schedule },
    { label: "Service Area", value: content.atAGlance.serviceArea },
    { label: "Team Environment", value: content.atAGlance.teamEnvironment },
    { label: "Experience", value: content.atAGlance.experience },
    { label: "Transportation", value: content.atAGlance.transportation },
    { label: "Growth Path", value: content.atAGlance.growthPath },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* HEADER BANNER */}
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-3 text-sm font-medium" aria-label="Language">
          <Link
            href="/careers"
            className={locale === "en" ? "text-brand-800 underline" : "text-neutral-500 hover:text-brand-700"}
          >
            English
          </Link>
          <span className="text-neutral-300">|</span>
          <Link
            href="/careers?lang=es"
            className={locale === "es" ? "text-brand-800 underline" : "text-neutral-500 hover:text-brand-700"}
          >
            Español
          </Link>
        </nav>
      </header>

      {/* HERO */}
      <SectionContainer tint className="pb-16 pt-14 text-center sm:pb-20 sm:pt-20">
        <p className="text-lg font-semibold uppercase tracking-widest text-gold-600">Mama&apos;s Cleaning Crew</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-brand-800 sm:text-5xl">
          {content.heroHeadline}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg font-medium text-brand-600">{content.heroSubheadline}</p>
        {content.heroBody.map((paragraph, i) => (
          <p key={i} className="mx-auto mt-4 max-w-xl text-sm text-neutral-600">
            {paragraph}
          </p>
        ))}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#open-positions">
            <Button size="lg">{content.primaryCtaLabel}</Button>
          </a>
          <a href="#our-story">
            <Button variant="ghost" size="lg">
              {content.secondaryCtaLabel}
            </Button>
          </a>
        </div>
      </SectionContainer>

      {/* OUR STORY — Learn About Mama's */}
      {content.sectionVisibility.ourStory && (
        <SectionContainer id="our-story">
          <h2 className="text-center text-2xl font-bold text-brand-800">{t.ourStoryHeading}</h2>
          <p className="mt-2 text-center text-sm font-medium text-brand-600">{content.ourStoryTagline}</p>
          <div className="mx-auto mt-6 max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-700">
            {content.ourStoryParagraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </SectionContainer>
      )}

      {/* RECRUITING VIDEO — See What It's Like to Work Here. Completely hidden
          from the public page until an Admin sets a real video URL — no
          placeholder shown to candidates (the Admin settings page shows its
          own "Recruiting Video Not Yet Added" state instead). */}
      {videoUrl && (
        <SectionContainer className="text-center">
          <h2 className="text-2xl font-bold text-brand-800">{t.videoHeading}</h2>
          <div className="mx-auto mt-6 aspect-video max-w-2xl overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
            <iframe
              src={videoUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </SectionContainer>
      )}

      {/* JOB DESCRIPTION — Understand the Cleaning Technician Position */}
      {content.sectionVisibility.jobDescription && postings.length > 0 && (
        <SectionContainer tint>
          <h2 className="text-center text-2xl font-bold text-brand-800">{t.jobDescriptionHeading}</h2>
          <div className="mx-auto mt-8 max-w-2xl space-y-6">
            {postings.map((p) => (
              <div key={p.slug} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <p className="text-lg font-semibold text-brand-800">{p.titleEn}</p>
                {p.positionType && <p className="text-xs text-neutral-500">{p.positionType}</p>}
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-700">
                  {content.jobDescriptionParagraphs.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
                <dl className="mt-6 grid grid-cols-1 gap-3 border-t border-neutral-100 pt-6 sm:grid-cols-2">
                  {atAGlance.map((f) => (
                    <div key={f.label}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{f.label}</dt>
                      <dd className="mt-0.5 text-sm text-neutral-700">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </SectionContainer>
      )}

      {/* WHY WORK AT MAMA'S — Understand What MCC Offers */}
      {content.sectionVisibility.whyWork && (
        <SectionContainer>
          <h2 className="text-center text-2xl font-bold text-brand-800">{t.whyWorkHeading}</h2>
          <p className="mt-2 text-center text-sm font-medium text-brand-600">{content.whyWorkTagline}</p>
          <ul className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            {content.whyWorkItems.map((item, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm">
                <span className="text-gold-500">★</span>
                <span className="text-sm text-neutral-700">
                  <span className="font-semibold text-brand-800">{item.title}</span>
                  <br />
                  {item.description}
                </span>
              </li>
            ))}
          </ul>
        </SectionContainer>
      )}

      {/* REALISTIC JOB PREVIEW — Understand Expectations */}
      {content.sectionVisibility.jobPreview && (
        <SectionContainer tint>
          <h2 className="text-2xl font-bold text-brand-800">{t.jobPreviewHeading}</h2>
          <div className="mx-auto mt-4 max-w-2xl space-y-3 text-sm text-neutral-700">
            {content.jobPreviewIntro.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
            <p className="font-medium text-neutral-800">{t.jobPreviewAlsoLabel}</p>
          </div>
          <ul className="mx-auto mt-3 max-w-2xl space-y-3">
            {content.jobPreviewBullets.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-neutral-700">
                <span className="mt-0.5 text-brand-500">•</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-6 max-w-2xl text-sm text-neutral-700">{content.jobPreviewClosing}</p>
        </SectionContainer>
      )}

      {/* CAREER GROWTH — See Career Growth */}
      {content.sectionVisibility.careerGrowth && (
        <SectionContainer className="text-center">
          <h2 className="text-2xl font-bold text-brand-800">{t.careerGrowthHeading}</h2>
          <p className="mt-2 text-sm font-medium text-brand-600">{content.careerGrowthTagline}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-600">{content.careerGrowthBody}</p>
          <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            {t.careerLadder.map((role, i) => (
              <div key={role} className="flex items-center gap-2">
                <span className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white sm:text-xs md:text-sm">
                  {role}
                </span>
                {i < t.careerLadder.length - 1 && (
                  <span className="text-gold-500" aria-hidden="true">
                    <span className="sm:hidden">↓</span>
                    <span className="hidden sm:inline">→</span>
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mx-auto mt-4 max-w-xl text-xs text-neutral-500">{content.careerGrowthClosing}</p>
        </SectionContainer>
      )}

      {/* MCC CULTURE / MAMAS VALUES */}
      {content.sectionVisibility.mamasValues && (
        <SectionContainer tint>
          <h2 className="text-center text-2xl font-bold text-brand-800">{t.mamasHeading}</h2>
          <p className="mt-2 text-center text-sm font-medium text-brand-600">{content.mamasValuesTagline}</p>
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-5">
            {MAMAS_LETTERS.map((v, i) => (
              <div key={`${v.letter}-${v.word}`} className="rounded-xl border border-neutral-200 bg-white p-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gold-500 text-lg font-bold text-brand-900">
                  {v.letter}
                </div>
                <p className="font-semibold text-brand-800">{v.word}</p>
                <p className="mt-1 text-xs text-neutral-600">{content.mamasValuesDescriptions[i]}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-neutral-500">{content.mamasValuesClosing}</p>
        </SectionContainer>
      )}

      {/* WHO THRIVES / SELF-SELECTION */}
      {content.sectionVisibility.whoThrives && (
        <SectionContainer>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <h2 className="text-xl font-bold text-brand-800">{content.whoThrivesHeading}</h2>
              <ul className="mt-4 space-y-2">
                {content.whoThrivesItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                    <span className="text-green-600">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xl font-bold text-brand-800">{content.notRightFitHeading}</h2>
              <div className="mt-4 space-y-2">
                {content.notRightFitIntro.map((paragraph, i) => (
                  <p key={i} className="text-sm text-neutral-600">
                    {paragraph}
                  </p>
                ))}
              </div>
              <ul className="mt-2 space-y-2">
                {content.notRightFitItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-neutral-600">
                    <span className="text-neutral-400">–</span> {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-neutral-600">{content.notRightFitClosing}</p>
            </div>
          </div>
        </SectionContainer>
      )}

      {/* OPEN POSITIONS — View Open Position */}
      <SectionContainer tint id="open-positions">
        <h2 className="text-center text-2xl font-bold text-brand-800">{t.openPositionsHeading}</h2>
        {postings.length === 0 ? (
          <p className="mt-6 text-center text-neutral-500">{t.noOpenPositions}</p>
        ) : (
          <ul className="mx-auto mt-8 max-w-2xl space-y-3">
            {postings.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/apply/${p.slug}`}
                  className="flex flex-col items-start justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-gold-400 hover:shadow-md sm:flex-row sm:items-center"
                >
                  <div>
                    <span className="text-lg font-semibold text-brand-800">{p.titleEn}</span>
                    {p.positionType && <p className="text-xs text-neutral-500">{p.positionType}</p>}
                  </div>
                  <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                    {t.applyNow}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionContainer>

      {/* FAQ */}
      {content.sectionVisibility.faq && (
        <SectionContainer>
          <h2 className="text-center text-2xl font-bold text-brand-800">{t.faqHeading}</h2>
          <div className="mx-auto mt-8 max-w-2xl space-y-5">
            {content.faqs.map((f, i) => (
              <div key={i}>
                <p className="font-semibold text-brand-800">{f.q}</p>
                <p className="mt-1 text-sm text-neutral-600">{f.a}</p>
              </div>
            ))}
          </div>
        </SectionContainer>
      )}

      {/* FINAL CTA */}
      {content.sectionVisibility.finalCta && (
        <SectionContainer tint className="text-center">
          <h2 className="text-2xl font-bold text-brand-800">{content.finalCtaHeadline}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-600">{content.finalCtaBody}</p>
          <div className="mt-6">
            <a href="#open-positions">
              <Button size="lg">{content.finalCtaButtonLabel}</Button>
            </a>
          </div>
        </SectionContainer>
      )}

      <footer className="border-t border-neutral-200 bg-neutral-50 px-4 py-10 text-xs leading-relaxed text-neutral-500 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-3">
          <p className="font-semibold text-neutral-700">Application Disclaimer — Mama&apos;s Cleaning Crew</p>
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
