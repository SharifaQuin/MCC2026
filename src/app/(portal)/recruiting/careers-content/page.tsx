import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { getCareersV2Content, type CareersV2Content } from "@/lib/recruiting";
import { setCareersV2ContentAction, resetCareersV2ContentAction } from "@/app/actions/careersContent";

const joinLines = (items: string[]) => items.join("\n");
const joinBlocks = (items: string[]) => items.join("\n\n");
const joinTitledBlocks = (items: { title: string; description: string }[]) =>
  items.map((i) => `${i.title}\n${i.description}`).join("\n\n");
const joinQaBlocks = (items: { q: string; a: string }[]) => items.map((i) => `${i.q}\n${i.a}`).join("\n\n");

function Field({ label, name, defaultValue, help }: { label: string; name: string; defaultValue: string; help?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-900">{label}</span>
      {help && <span className="mt-0.5 block text-xs text-neutral-500">{help}</span>}
      <input
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  help,
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue: string;
  help?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-900">{label}</span>
      {help && <span className="mt-0.5 block text-xs text-neutral-500">{help}</span>}
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="font-semibold text-neutral-900">{title}</h2>
      {children}
    </div>
  );
}

const BULLET_HELP = "One bullet per line.";
const PARAGRAPH_HELP = "Separate paragraphs with a blank line.";
const TITLED_HELP =
  "Separate entries with a blank line. Within an entry, the first line is the title and the rest is the description.";
const QA_HELP = "Separate entries with a blank line. Within an entry, the first line is the question, the rest is the answer.";

export default async function CareersContentPage() {
  await requireRecruitingAccess();
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/recruiting");

  const c: CareersV2Content = await getCareersV2Content();

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <Link href="/recruiting/experience" className="text-sm text-brand-700 hover:underline">
        ← Back to Careers Page Experience
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-semibold">Edit Careers Page Copy</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Every sentence on the public{" "}
        <a href="/careers" target="_blank" rel="noopener noreferrer" className="underline">
          /careers
        </a>{" "}
        page (Draft 2 only) is editable here — no code change or deploy needed. Section headings, the
        MAMAS letters, the career ladder role names, and the &quot;At a Glance&quot; field labels stay
        fixed; everything else on the page comes from the fields below.
      </p>

      <form action={setCareersV2ContentAction} className="space-y-6">
        <Section title="Hero">
          <Field label="Headline" name="heroHeadline" defaultValue={c.heroHeadline} />
          <Field label="Subheadline" name="heroSubheadline" defaultValue={c.heroSubheadline} />
          <TextArea label="Body" name="heroBody" defaultValue={joinBlocks(c.heroBody)} help={PARAGRAPH_HELP} rows={4} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary button label" name="primaryCtaLabel" defaultValue={c.primaryCtaLabel} />
            <Field label="Secondary button label" name="secondaryCtaLabel" defaultValue={c.secondaryCtaLabel} />
          </div>
        </Section>

        <Section title="Our Story">
          <Field label="Tagline" name="ourStoryTagline" defaultValue={c.ourStoryTagline} />
          <TextArea
            label="Paragraphs"
            name="ourStoryParagraphs"
            defaultValue={joinBlocks(c.ourStoryParagraphs)}
            help={PARAGRAPH_HELP}
            rows={8}
          />
        </Section>

        <Section title="The Cleaning Technician Position (Job Description)">
          <TextArea
            label="Paragraphs"
            name="jobDescriptionParagraphs"
            defaultValue={joinBlocks(c.jobDescriptionParagraphs)}
            help={PARAGRAPH_HELP}
            rows={8}
          />
          <p className="text-sm font-medium text-neutral-900">At a Glance</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Schedule" name="atAGlanceSchedule" defaultValue={c.atAGlance.schedule} />
            <Field label="Service Area" name="atAGlanceServiceArea" defaultValue={c.atAGlance.serviceArea} />
            <Field label="Team Environment" name="atAGlanceTeamEnvironment" defaultValue={c.atAGlance.teamEnvironment} />
            <Field label="Experience" name="atAGlanceExperience" defaultValue={c.atAGlance.experience} />
            <Field label="Transportation" name="atAGlanceTransportation" defaultValue={c.atAGlance.transportation} />
            <Field label="Growth Path" name="atAGlanceGrowthPath" defaultValue={c.atAGlance.growthPath} />
          </div>
        </Section>

        <Section title="Why Work at Mama's">
          <Field label="Tagline" name="whyWorkTagline" defaultValue={c.whyWorkTagline} />
          <TextArea
            label="Cards"
            name="whyWorkItems"
            defaultValue={joinTitledBlocks(c.whyWorkItems)}
            help={TITLED_HELP}
            rows={16}
          />
        </Section>

        <Section title="What the Job Actually Involves">
          <TextArea
            label="Intro paragraphs"
            name="jobPreviewIntro"
            defaultValue={joinBlocks(c.jobPreviewIntro)}
            help={PARAGRAPH_HELP}
            rows={4}
          />
          <TextArea
            label="Bullets"
            name="jobPreviewBullets"
            defaultValue={joinLines(c.jobPreviewBullets)}
            help={BULLET_HELP}
            rows={10}
          />
          <TextArea
            label="Closing line"
            name="jobPreviewClosing"
            defaultValue={c.jobPreviewClosing}
            rows={2}
          />
        </Section>

        <Section title="Grow With Mama's">
          <Field label="Tagline" name="careerGrowthTagline" defaultValue={c.careerGrowthTagline} />
          <TextArea label="Body" name="careerGrowthBody" defaultValue={c.careerGrowthBody} rows={2} />
          <TextArea
            label="Closing line (under the ladder)"
            name="careerGrowthClosing"
            defaultValue={c.careerGrowthClosing}
            rows={2}
          />
        </Section>

        <Section title="The MAMAS Way">
          <Field label="Tagline" name="mamasValuesTagline" defaultValue={c.mamasValuesTagline} />
          <TextArea
            label="Descriptions (in order: Meticulous, Authentic, Mindful, Allegiant, Sincere)"
            name="mamasValuesDescriptions"
            defaultValue={joinLines(c.mamasValuesDescriptions)}
            help="Exactly 5 lines, one per value, in this order: Meticulous, Authentic, Mindful, Allegiant, Sincere."
            rows={5}
          />
          <TextArea label="Closing line" name="mamasValuesClosing" defaultValue={c.mamasValuesClosing} rows={2} />
        </Section>

        <Section title="Who Thrives / Is This Right for You">
          <Field label="'Who thrives' heading" name="whoThrivesHeading" defaultValue={c.whoThrivesHeading} />
          <TextArea
            label="'Who thrives' bullets"
            name="whoThrivesItems"
            defaultValue={joinLines(c.whoThrivesItems)}
            help={BULLET_HELP}
            rows={10}
          />
          <Field label="'Is this right for you' heading" name="notRightFitHeading" defaultValue={c.notRightFitHeading} />
          <TextArea
            label="Intro paragraphs"
            name="notRightFitIntro"
            defaultValue={joinBlocks(c.notRightFitIntro)}
            help={PARAGRAPH_HELP}
            rows={3}
          />
          <TextArea
            label="Bullets"
            name="notRightFitItems"
            defaultValue={joinLines(c.notRightFitItems)}
            help={BULLET_HELP}
            rows={8}
          />
          <TextArea label="Closing line" name="notRightFitClosing" defaultValue={c.notRightFitClosing} rows={2} />
        </Section>

        <Section title="Recruiting FAQ">
          <TextArea label="Questions & answers" name="faqs" defaultValue={joinQaBlocks(c.faqs)} help={QA_HELP} rows={20} />
        </Section>

        <Section title="Final CTA">
          <Field label="Headline" name="finalCtaHeadline" defaultValue={c.finalCtaHeadline} />
          <TextArea label="Body" name="finalCtaBody" defaultValue={c.finalCtaBody} rows={2} />
          <Field label="Button label" name="finalCtaButtonLabel" defaultValue={c.finalCtaButtonLabel} />
        </Section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            Save Changes
          </button>
          <a
            href="/careers"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-neutral-300 px-5 py-2.5 font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Preview Live Page ↗
          </a>
        </div>
      </form>

      <form action={resetCareersV2ContentAction} className="mt-6 border-t border-neutral-200 pt-6">
        <p className="mb-2 text-sm text-neutral-500">
          Discard all edits above and restore the last approved copy.
        </p>
        <button
          type="submit"
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Reset to Default Copy
        </button>
      </form>
    </div>
  );
}
