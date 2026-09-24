import Link from "next/link";
import { SectionContainer } from "@/components/ds/Card";
import Button from "@/components/ds/Button";

// Recruiting 2.0's careers landing page. Every factual claim here is
// sourced from verified MCC content and the actual hard/preferred
// qualifiers configured on the Cleaning Technician posting — nothing
// about compensation, bonuses, PTO, or benefits is invented; where
// something isn't verified, it's left out rather than guessed at.
// Copy approved 2026 — see conversation history before rewording.

const CAREER_LADDER = ["Cleaning Technician", "Lead Technician", "Trainer", "Field Supervisor", "Service Manager"];

const JOB_DESCRIPTION_COPY = [
  "As a Cleaning Technician with Mama's Cleaning Crew, you'll help care for homes throughout Orange County while working as part of a professional cleaning team.",
  "You'll follow MCC's cleaning procedures, work efficiently while maintaining attention to detail, communicate professionally with clients and teammates, and help make sure every home receives the level of care our clients expect.",
  "Professional cleaning is active, physical work. You'll spend much of your day standing, walking, bending, reaching, carrying cleaning supplies, and moving between cleaning tasks and client locations.",
  "We'll teach you the Mama's way through structured training, clear procedures, coaching, and feedback. For team members interested in taking on more responsibility, there are opportunities to grow into leadership and training roles within MCC.",
];

const JOB_AT_A_GLANCE = [
  { label: "Schedule", value: "Monday–Friday, daytime availability between 8:00 AM and 6:00 PM" },
  { label: "Service Area", value: "Orange County" },
  {
    label: "Team Environment",
    value: "Work alongside other MCC Cleaning Technicians as part of our team-based cleaning model",
  },
  {
    label: "Experience",
    value: "1+ year professional residential cleaning experience OR 3+ years independent residential cleaning experience",
  },
  { label: "Transportation", value: "Reliable vehicle, valid driver's license, and current auto insurance required" },
  { label: "Growth Path", value: "Cleaning Technician → Lead Technician → Trainer → Field Supervisor → Service Manager" },
];

const WHY_WORK_HERE = [
  { title: "Daytime Work", description: "Our Cleaning Technician schedule operates Monday through Friday during daytime hours." },
  {
    title: "Structured Training",
    description: "Learn MCC's cleaning procedures, quality standards, safety expectations, and approach to client hospitality.",
  },
  {
    title: "Team Environment",
    description: "You're part of a team. Communication, teamwork, and supporting one another are important parts of how we work.",
  },
  {
    title: "Clear Expectations",
    description:
      "We believe employees should understand what's expected of them. MCC uses defined procedures, training, and quality standards rather than leaving you to figure everything out on your own.",
  },
  {
    title: "Opportunity to Grow",
    description:
      "Cleaning Technician is the starting point of our career path. Team members who demonstrate strong performance, reliability, leadership, and mastery of MCC procedures may have opportunities to advance as the company grows.",
  },
  {
    title: "Meaningful Work",
    description:
      "The work you do directly impacts our clients. A clean home can give someone back time, reduce stress, and create a space where they can simply enjoy being home.",
  },
  {
    title: "Mileage Reimbursement",
    description: "Eligible mileage between assigned job locations is reimbursed separately according to MCC policy.",
  },
];

const REALISTIC_PREVIEW = [
  "Travel between assigned client locations throughout our Orange County service area.",
  "Clean kitchens, bathrooms, bedrooms, common areas, and other assigned spaces according to the client's service.",
  "Follow MCC's cleaning procedures and quality standards.",
  "Work with speed and purpose without sacrificing quality.",
  "Work collaboratively with your teammate and the rest of the MCC team.",
  "Check your work before moving on and help make sure the home is ready before your team leaves.",
  "Treat every client's home, belongings, and privacy with care and respect.",
  "Communicate professionally with clients, teammates, and the office.",
  "Arrive prepared and on time for scheduled work.",
  "Receive coaching and feedback as you learn and grow.",
];

const WHO_THRIVES = [
  "Show up when people are counting on you.",
  "Notice the details other people may overlook.",
  "Take pride in doing a job correctly.",
  "Are open to learning a company's way of doing things.",
  "Can receive feedback and apply it.",
  "Enjoy working as part of a team.",
  "Communicate honestly and professionally.",
  "Respect other people's homes, belongings, and privacy.",
  "Are comfortable staying active throughout your workday.",
  "Understand that both quality AND efficiency matter.",
];

const NOT_RIGHT_FIT = [
  "Regularly struggle with attendance or punctuality.",
  "Don't enjoy active, physical work.",
  "Don't have reliable transportation.",
  "Cannot meet the required weekday availability.",
  "Prefer working completely independently rather than as part of a team.",
  "Don't like following established procedures.",
  "Aren't comfortable receiving coaching or constructive feedback.",
  "Prefer working at your own pace regardless of the team's schedule.",
];

const MAMAS_VALUES = [
  { letter: "M", word: "Meticulous", description: "We pay attention to the details and take pride in doing the job right." },
  { letter: "A", word: "Authentic", description: "We communicate honestly, take accountability, and build trust through our actions." },
  { letter: "M", word: "Mindful", description: "We respect our clients, their homes, our teammates, and the environment around us." },
  { letter: "A", word: "Allegiant", description: "We are committed to our team, our clients, and the standards we've agreed to uphold." },
  { letter: "S", word: "Sincere", description: "We lead with genuine care, professionalism, and respect." },
];

const FAQS = [
  {
    q: "What is the schedule?",
    a: "Cleaning Technician positions require Monday–Friday daytime availability between 8:00 AM and 6:00 PM. Your actual assigned schedule may vary based on client appointments and business needs.",
  },
  {
    q: "Where will I work?",
    a: "Mama's Cleaning Crew serves clients throughout Orange County. Cleaning Technicians travel between assigned client locations during the workday.",
  },
  {
    q: "Do I need my own vehicle?",
    a: "Yes. Cleaning Technicians must have reliable transportation, a valid driver's license, and current auto insurance.",
  },
  {
    q: "Do I need residential cleaning experience?",
    a: "Yes. For the Cleaning Technician position, we're currently looking for candidates with at least one year of professional residential cleaning experience or at least three years of independent residential cleaning experience.",
  },
  {
    q: "Do I need a resume?",
    a: "No. A resume is optional for Cleaning Technician applicants. If you have one, you're welcome to upload it with your application.",
  },
  {
    q: "Will I receive training?",
    a: "Yes. New Cleaning Technicians receive structured training on MCC procedures, quality expectations, safety, teamwork, and client hospitality. Coaching and feedback continue as you develop in the role.",
  },
  {
    q: "Is there room to grow?",
    a: "Yes. MCC's career path includes Cleaning Technician, Lead Technician, Trainer, Field Supervisor, and Service Manager. Advancement depends on performance, reliability, mastery of MCC procedures, leadership ability, business needs, and position availability.",
  },
  {
    q: "What happens after I apply?",
    a: "We'll confirm that we've received your application and review the information you provided. If you're selected to move forward, we'll contact you with the next step. Candidates invited to interview will be able to choose from available interview times provided by MCC.",
  },
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
          At Mama&apos;s Cleaning Crew, we&apos;re building a team of dependable, hardworking people who
          take pride in creating clean, peaceful spaces for our clients.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-600">
          If you&apos;re looking for a team where you can learn, grow, be supported, and take pride in
          the work you do, we&apos;d love for you to learn more about us.
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
        <p className="mt-2 text-center text-sm font-medium text-brand-600">More Than Cleaning</p>
        <div className="mx-auto mt-6 max-w-2xl space-y-4 text-sm leading-relaxed text-neutral-700">
          <p>
            Mama&apos;s Cleaning Crew was founded by Sharifa Quinland with a simple idea: build a cleaning
            company around family values, care, and the belief that a clean space can bring a little
            more peace into someone&apos;s life.
          </p>
          <p>Our work goes beyond checking items off a cleaning list.</p>
          <p>
            We want our clients to come home and feel a sense of relief. We want our employees to
            understand that the work they do matters. And we want to build a company where high
            standards and genuine care can exist together.
          </p>
          <p>That&apos;s the heart behind Mama&apos;s Cleaning Crew.</p>
        </div>
      </SectionContainer>

      {/* RECRUITING VIDEO — See What It's Like to Work Here. Completely hidden
          from the public page until an Admin sets a real video URL — no
          placeholder shown to candidates (the Admin settings page shows its
          own "Recruiting Video Not Yet Added" state instead). */}
      {videoUrl && (
        <SectionContainer className="text-center">
          <h2 className="text-2xl font-bold text-brand-800">See What It&apos;s Like to Work at Mama&apos;s</h2>
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
      {postings.length > 0 && (
        <SectionContainer tint>
          <h2 className="text-center text-2xl font-bold text-brand-800">The Cleaning Technician Position</h2>
          <div className="mx-auto mt-8 max-w-2xl space-y-6">
            {postings.map((p) => (
              <div key={p.slug} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <p className="text-lg font-semibold text-brand-800">{p.titleEn}</p>
                {p.positionType && <p className="text-xs text-neutral-500">{p.positionType}</p>}
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-700">
                  {JOB_DESCRIPTION_COPY.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
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
        <p className="mt-2 text-center text-sm font-medium text-brand-600">
          A Team Built Around Standards, Support &amp; Growth
        </p>
        <ul className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {WHY_WORK_HERE.map((item) => (
            <li key={item.title} className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm">
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

      {/* REALISTIC JOB PREVIEW — Understand Expectations */}
      <SectionContainer tint>
        <h2 className="text-2xl font-bold text-brand-800">What the Job Actually Involves</h2>
        <div className="mx-auto mt-4 max-w-2xl space-y-3 text-sm text-neutral-700">
          <p>We want you to understand the job before you apply.</p>
          <p>
            Professional cleaning is active, hands-on work. You&apos;ll spend much of your shift moving,
            standing, bending, reaching, carrying supplies, and cleaning different areas of our
            clients&apos; homes.
          </p>
          <p className="font-medium text-neutral-800">You&apos;ll also:</p>
        </div>
        <ul className="mx-auto mt-3 max-w-2xl space-y-3">
          {REALISTIC_PREVIEW.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-neutral-700">
              <span className="mt-0.5 text-brand-500">•</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-6 max-w-2xl text-sm text-neutral-700">
          This is a job for someone who enjoys staying active and can take pride in seeing the
          difference their work makes.
        </p>
      </SectionContainer>

      {/* CAREER GROWTH — See Career Growth */}
      <SectionContainer className="text-center">
        <h2 className="text-2xl font-bold text-brand-800">Grow With Mama&apos;s</h2>
        <p className="mt-2 text-sm font-medium text-brand-600">Your Journey Can Start Here</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-600">
          We want team members who are interested in learning, developing their skills, and taking on
          greater responsibility over time.
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
          Advancement isn&apos;t automatic — it&apos;s earned through strong performance, reliability,
          leadership, knowledge of MCC procedures, and readiness for greater responsibility.
        </p>
      </SectionContainer>

      {/* MCC CULTURE / MAMAS VALUES */}
      <SectionContainer tint>
        <h2 className="text-center text-2xl font-bold text-brand-800">The MAMAS Way</h2>
        <p className="mt-2 text-center text-sm font-medium text-brand-600">Our Values Guide How We Work</p>
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
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-neutral-500">
          These aren&apos;t just words on a wall. They&apos;re the standard we want reflected in how we
          clean, communicate, solve problems, and treat one another.
        </p>
      </SectionContainer>

      {/* WHO THRIVES / SELF-SELECTION */}
      <SectionContainer>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-brand-800">You May Feel Right at Home Here If You...</h2>
            <ul className="mt-4 space-y-2">
              {WHO_THRIVES.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                  <span className="text-green-600">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-bold text-brand-800">We Want This to Be the Right Fit for Both of Us</h2>
            <p className="mt-4 text-sm text-neutral-600">
              Professional cleaning isn&apos;t the right job for everyone — and that&apos;s okay.
            </p>
            <p className="mt-2 text-sm text-neutral-600">This position may not be the best fit if you:</p>
            <ul className="mt-2 space-y-2">
              {NOT_RIGHT_FIT.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-600">
                  <span className="text-neutral-400">–</span> {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-neutral-600">
              We&apos;d rather be clear about the job upfront so you can decide whether Mama&apos;s feels
              right for you.
            </p>
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
          If you&apos;re dependable, hardworking, open to learning, and ready to take pride in the work
          you do, we&apos;d love to learn more about you.
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
