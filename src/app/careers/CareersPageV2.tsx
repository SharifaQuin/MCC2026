import Link from "next/link";
import { SectionContainer } from "@/components/ds/Card";
import Button from "@/components/ds/Button";

// Recruiting 2.0's careers landing page. Every factual claim here is
// sourced from verified MCC content (the Module 1 "Who We Are" training
// transcript, and the actual hard/preferred qualifiers configured on the
// Cleaning Technician posting) — nothing about compensation, bonuses,
// PTO, or mileage rates is invented; where something isn't verified, it's
// left out rather than guessed at, per the approved plan.

const CAREER_LADDER = ["Cleaning Technician", "Lead Technician", "Trainer", "Field Supervisor", "Service Manager"];

const WHY_WORK_HERE = [
  "A Monday–Friday daytime schedule — no working the pipeline of every rotating shift.",
  "Structured training before you're ever on your own with a client.",
  "You're paired with the same teammate every day — you're never figuring it out solo.",
  "Clear procedures and expectations for every job, not vague guesswork.",
  "A real path to grow — Cleaning Technician isn't a dead end, it's step one.",
  "Work that actually helps people — residential clients, businesses, and move-in/move-out homes throughout Orange County.",
  "Mileage between jobs is reimbursed separately from your pay.",
];

const REALISTIC_PREVIEW = [
  "Cleaning is active, physical, on-your-feet work — most of your shift is moving, lifting, and cleaning.",
  "You'll travel between client homes throughout our Orange County service area every day.",
  "MCC has detailed, structured cleaning procedures for every job — you'll be trained on them, and expected to follow them.",
  "Quality matters: clients rate every visit, and re-cleans happen when a job isn't fully satisfactory.",
  "Speed and efficiency matter alongside quality — the job has a real pace to it.",
  "You'll work as a paired team every day, not alone.",
  "Professionalism inside a client's home — in uniform, respectful, and mindful of their space — is expected every time.",
  "Attendance and punctuality matter — your team is counting on you to show up.",
  "You'll get regular coaching and feedback, and you're expected to be coachable in return.",
];

const WHO_THRIVES = [
  "Dependable — your team and your clients can count on you.",
  "Detail-oriented — the little things are what clients actually notice.",
  "Coachable — open to feedback and quick to apply it.",
  "Team-oriented — comfortable working closely with the same partner every day.",
  "Professional — in a client's home, on the phone, and with the office.",
  "Comfortable staying active for a full shift.",
  "Communicates clearly and honestly.",
  "Takes real pride in their work.",
  "Follows procedures rather than improvising.",
  "Works with speed and purpose, not just at their own pace.",
];

const NOT_RIGHT_FIT = [
  "You frequently struggle with punctuality or attendance.",
  "You don't enjoy active, physical work.",
  "You don't have reliable transportation.",
  "You can't meet the Monday–Friday daytime availability this role requires.",
  "You dislike following structured procedures.",
  "You're uncomfortable receiving feedback or coaching.",
];

const MAMAS_VALUES = [
  { letter: "M", word: "Meticulous", description: "Handling every detail with precision — the little things are what clients actually notice." },
  { letter: "A", word: "Authentic", description: "Building trust through honesty and integrity, every time." },
  { letter: "M", word: "Mindful", description: "Caring about eco-friendly practices, respecting the homes and the planet we work in." },
  { letter: "A", word: "Allegiant", description: "Staying loyal to your clients — showing up for them the way you'd want someone to show up for your own family." },
  { letter: "S", word: "Sincere", description: "Being reliable and respectful in everything you do." },
];

const FAQS = [
  {
    q: "What's the schedule like?",
    a: "Cleaning Technicians work Monday through Friday, daytime hours (between 8:00 AM and 6:00 PM) — no nights, no weekends.",
  },
  {
    q: "What's the service area?",
    a: "We serve clients throughout Orange County, and technicians travel between homes across that area during the day.",
  },
  {
    q: "Do I need my own vehicle?",
    a: "Yes — you'll need a reliable vehicle, a valid driver's license, and current auto insurance to travel between job sites.",
  },
  {
    q: "Do I need professional cleaning experience?",
    a: "We look for at least 1 year of paid/professional residential cleaning experience, or at least 3 years of independent/personal cleaning experience — professional experience isn't the only path in.",
  },
  {
    q: "Is a resume required?",
    a: "No — a resume is optional for this position. You're welcome to attach one, but it's not required to apply.",
  },
  {
    q: "Is there training?",
    a: "Yes — every new Cleaning Technician goes through structured training before working independently with clients, and continues to get coaching and feedback on the job.",
  },
  {
    q: "Is there room to grow?",
    a: "Yes — Cleaning Technician is the entry point to a career path at MCC, with growth into Lead Technician, Trainer, Field Supervisor, and Service Manager roles for those who want to take it on.",
  },
  {
    q: "What happens after I apply?",
    a: "You'll hear back from us quickly to confirm we received your application. If you meet our requirements, we'll reach out to schedule a time to meet — you'll pick a time that works for you from the interview slots we have open.",
  },
];

const JOB_AT_A_GLANCE = [
  { label: "Schedule", value: "Monday–Friday, daytime hours" },
  { label: "Service Area", value: "Orange County" },
  { label: "Team Structure", value: "Paired with the same teammate every day" },
  {
    label: "Experience",
    value: "1+ year professional residential cleaning, or 3+ years cleaning independently",
  },
  { label: "Transportation", value: "Reliable vehicle, valid driver's license, current auto insurance" },
  { label: "Growth Path", value: "Lead Technician → Trainer → Field Supervisor → Service Manager" },
];

export default function CareersPageV2({
  postings,
  videoUrl,
}: {
  postings: { slug: string; titleEn: string; positionType: string | null; descriptionEn: string }[];
  videoUrl: string | null;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* HERO */}
      <SectionContainer tint className="pb-16 pt-14 text-center sm:pb-20 sm:pt-20">
        <p className="text-lg font-semibold uppercase tracking-widest text-gold-600">Mama&apos;s Cleaning Crew</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-brand-800 sm:text-5xl">
          Come Grow With Mama&apos;s
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg font-medium text-brand-600">
          More Than a Cleaning Job. A Place to Grow.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-sm text-neutral-600">
          Join a professional Orange County cleaning company built around dependable people,
          excellent service, real teamwork, and a real path to grow.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#open-positions">
            <Button size="lg">View Open Positions</Button>
          </a>
          <a href="#our-story">
            <Button variant="ghost" size="lg">
              Meet Mama&apos;s
            </Button>
          </a>
        </div>
      </SectionContainer>

      {/* OUR STORY — Learn About Mama's */}
      <SectionContainer id="our-story">
        <h2 className="text-center text-2xl font-bold text-brand-800">Our Story</h2>
        <div className="mx-auto mt-6 max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-700">
          <p>
            Mama&apos;s Cleaning Crew started back in 2023, founded by Sharifa Quinland with a simple idea:
            build a cleaning company around family values, not just a service list. Since then, we&apos;ve
            grown into a team of more than forty-five staff, all carrying forward that same founding
            spirit.
          </p>
          <p>
            Our mission is the heart of everything we do here: a clean space is the foundation of a
            peaceful life. We don&apos;t just clean — we care, we rejuvenate, and we create spaces where
            memories are made and cherished.
          </p>
          <p>
            We&apos;re proud of giving back, too — we provide free housecleaning for women battling cancer,
            and for the firefighters and police officers who protect our communities.
          </p>
        </div>
      </SectionContainer>

      {/* RECRUITING VIDEO — See What It's Like to Work Here */}
      <SectionContainer className="text-center">
        <h2 className="text-2xl font-bold text-brand-800">See What It&apos;s Like to Work at Mama&apos;s</h2>
        <div className="mx-auto mt-6 aspect-video max-w-2xl overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
          {videoUrl ? (
            <iframe
              src={videoUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-neutral-400">
              <span className="text-4xl">🎬</span>
              <p className="text-sm">Our team video is on its way — check back soon!</p>
            </div>
          )}
        </div>
      </SectionContainer>

      {/* JOB DESCRIPTION — Understand the Cleaning Technician Position */}
      {postings.length > 0 && (
        <SectionContainer tint>
          <h2 className="text-center text-2xl font-bold text-brand-800">The Cleaning Technician Position</h2>
          <div className="mx-auto mt-8 max-w-2xl space-y-6">
            {postings.map((p) => (
              <div key={p.slug} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <p className="text-lg font-semibold text-brand-800">{p.titleEn}</p>
                {p.positionType && <p className="text-xs text-neutral-500">{p.positionType}</p>}
                <p className="mt-4 text-sm leading-relaxed text-neutral-700">{p.descriptionEn}</p>
                <dl className="mt-6 grid grid-cols-1 gap-3 border-t border-neutral-100 pt-6 sm:grid-cols-2">
                  {JOB_AT_A_GLANCE.map((f) => (
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
      <SectionContainer>
        <h2 className="text-center text-2xl font-bold text-brand-800">Why Work at Mama&apos;s</h2>
        <ul className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {WHY_WORK_HERE.map((item, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm">
              <span className="text-gold-500">★</span>
              <span className="text-sm text-neutral-700">{item}</span>
            </li>
          ))}
        </ul>
      </SectionContainer>

      {/* REALISTIC JOB PREVIEW — Understand Expectations */}
      <SectionContainer tint>
        <h2 className="text-2xl font-bold text-brand-800">What the Job Actually Involves</h2>
        <ul className="mx-auto mt-6 max-w-2xl space-y-3">
          {REALISTIC_PREVIEW.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-neutral-700">
              <span className="mt-0.5 text-brand-500">•</span>
              {item}
            </li>
          ))}
        </ul>
      </SectionContainer>

      {/* CAREER GROWTH — See Career Growth */}
      <SectionContainer className="text-center">
        <h2 className="text-2xl font-bold text-brand-800">Grow With Mama&apos;s</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-600">
          Cleaning Technician is the beginning of a career path at MCC — not a dead end. We want
          people who are interested in learning, developing their skills, taking on responsibility,
          and growing with the company.
        </p>
        <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
          {CAREER_LADDER.map((role, i) => (
            <div key={role} className="flex items-center gap-2">
              <span className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white sm:text-xs md:text-sm">
                {role}
              </span>
              {i < CAREER_LADDER.length - 1 && <span className="text-gold-500">↓</span>}
            </div>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-xl text-xs text-neutral-500">
          Growth isn&apos;t automatic or guaranteed — it&apos;s earned through performance, reliability, and
          readiness. But the path is real, and it starts here.
        </p>
      </SectionContainer>

      {/* MCC CULTURE / MAMAS VALUES */}
      <SectionContainer tint>
        <h2 className="text-center text-2xl font-bold text-brand-800">The MAMAS Way</h2>
        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-5">
          {MAMAS_VALUES.map((v) => (
            <div key={v.word} className="rounded-xl border border-neutral-200 bg-white p-4 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gold-500 text-lg font-bold text-brand-900">
                {v.letter}
              </div>
              <p className="font-semibold text-brand-800">{v.word}</p>
              <p className="mt-1 text-xs text-neutral-600">{v.description}</p>
            </div>
          ))}
        </div>
      </SectionContainer>

      {/* WHO THRIVES / SELF-SELECTION */}
      <SectionContainer>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-brand-800">Who Thrives at Mama&apos;s</h2>
            <ul className="mt-4 space-y-2">
              {WHO_THRIVES.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                  <span className="text-green-600">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-bold text-brand-800">Is Mama&apos;s Right for You?</h2>
            <p className="mt-4 text-sm text-neutral-600">This role may not be a strong fit if:</p>
            <ul className="mt-2 space-y-2">
              {NOT_RIGHT_FIT.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-600">
                  <span className="text-neutral-400">–</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionContainer>

      {/* OPEN POSITIONS — View Open Position */}
      <SectionContainer tint id="open-positions">
        <h2 className="text-center text-2xl font-bold text-brand-800">Open Positions</h2>
        {postings.length === 0 ? (
          <p className="mt-6 text-center text-neutral-500">
            We don&apos;t have any open positions right now — check back soon!
          </p>
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
                    Apply Now
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionContainer>

      {/* FAQ */}
      <SectionContainer>
        <h2 className="text-center text-2xl font-bold text-brand-800">Questions? We&apos;ve Got Answers.</h2>
        <div className="mx-auto mt-8 max-w-2xl space-y-5">
          {FAQS.map((f) => (
            <div key={f.q}>
              <p className="font-semibold text-brand-800">{f.q}</p>
              <p className="mt-1 text-sm text-neutral-600">{f.a}</p>
            </div>
          ))}
        </div>
      </SectionContainer>

      {/* FINAL CTA */}
      <SectionContainer tint className="text-center">
        <h2 className="text-2xl font-bold text-brand-800">Ready to Grow With Mama&apos;s?</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-600">
          Explore our open positions and see if Mama&apos;s Cleaning Crew could be the right next
          step for you.
        </p>
        <div className="mt-6">
          <a href="#open-positions">
            <Button size="lg">View Open Positions</Button>
          </a>
        </div>
      </SectionContainer>

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
