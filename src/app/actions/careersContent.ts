"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  setCareersV2Content,
  resetCareersV2Content,
  DEFAULT_CAREERS_V2_CONTENT,
  type CareersV2Content,
} from "@/lib/recruiting";

// Editing the public Careers V2 copy is ADMIN-only, same reasoning as the
// Draft 1/2 toggle and video URL in recruitingExperience.ts — it changes
// what every visitor to the public careers page sees.
async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

// One bullet per line.
function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Paragraphs separated by a blank line; internal line breaks within a
// paragraph are collapsed to spaces (so wrapped text in the textarea still
// reads as one paragraph).
function parseBlocks(raw: string): string[] {
  return raw
    .split(/\n\s*\n+/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean).join(" "))
    .filter(Boolean);
}

// Blocks separated by a blank line; within a block the first line is the
// title/question and the rest is the description/answer.
function parseTitledBlocks(raw: string): { title: string; description: string }[] {
  return raw
    .split(/\n\s*\n+/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) => ({ title: lines[0], description: lines.slice(1).join(" ") }));
}

function parseQaBlocks(raw: string): { q: string; a: string }[] {
  return parseTitledBlocks(raw).map(({ title, description }) => ({ q: title, a: description }));
}

export async function setCareersV2ContentAction(formData: FormData) {
  await requireAdmin();

  const heroBody = parseBlocks(field(formData, "heroBody"));
  const ourStoryParagraphs = parseBlocks(field(formData, "ourStoryParagraphs"));
  const jobDescriptionParagraphs = parseBlocks(field(formData, "jobDescriptionParagraphs"));
  const whyWorkItems = parseTitledBlocks(field(formData, "whyWorkItems"));
  const jobPreviewIntro = parseBlocks(field(formData, "jobPreviewIntro"));
  const jobPreviewBullets = parseLines(field(formData, "jobPreviewBullets"));
  const whoThrivesItems = parseLines(field(formData, "whoThrivesItems"));
  const notRightFitIntro = parseBlocks(field(formData, "notRightFitIntro"));
  const notRightFitItems = parseLines(field(formData, "notRightFitItems"));
  const faqs = parseQaBlocks(field(formData, "faqs"));
  const mamasValuesDescriptions = parseLines(field(formData, "mamasValuesDescriptions"));

  const d = DEFAULT_CAREERS_V2_CONTENT;
  const content: CareersV2Content = {
    heroHeadline: field(formData, "heroHeadline") || d.heroHeadline,
    heroSubheadline: field(formData, "heroSubheadline") || d.heroSubheadline,
    heroBody: heroBody.length > 0 ? heroBody : d.heroBody,
    primaryCtaLabel: field(formData, "primaryCtaLabel") || d.primaryCtaLabel,
    secondaryCtaLabel: field(formData, "secondaryCtaLabel") || d.secondaryCtaLabel,
    ourStoryTagline: field(formData, "ourStoryTagline") || d.ourStoryTagline,
    ourStoryParagraphs: ourStoryParagraphs.length > 0 ? ourStoryParagraphs : d.ourStoryParagraphs,
    jobDescriptionParagraphs: jobDescriptionParagraphs.length > 0 ? jobDescriptionParagraphs : d.jobDescriptionParagraphs,
    atAGlance: {
      schedule: field(formData, "atAGlanceSchedule") || d.atAGlance.schedule,
      serviceArea: field(formData, "atAGlanceServiceArea") || d.atAGlance.serviceArea,
      teamEnvironment: field(formData, "atAGlanceTeamEnvironment") || d.atAGlance.teamEnvironment,
      experience: field(formData, "atAGlanceExperience") || d.atAGlance.experience,
      transportation: field(formData, "atAGlanceTransportation") || d.atAGlance.transportation,
      growthPath: field(formData, "atAGlanceGrowthPath") || d.atAGlance.growthPath,
    },
    whyWorkTagline: field(formData, "whyWorkTagline") || d.whyWorkTagline,
    whyWorkItems: whyWorkItems.length > 0 ? whyWorkItems : d.whyWorkItems,
    jobPreviewIntro: jobPreviewIntro.length > 0 ? jobPreviewIntro : d.jobPreviewIntro,
    jobPreviewBullets: jobPreviewBullets.length > 0 ? jobPreviewBullets : d.jobPreviewBullets,
    jobPreviewClosing: field(formData, "jobPreviewClosing") || d.jobPreviewClosing,
    careerGrowthTagline: field(formData, "careerGrowthTagline") || d.careerGrowthTagline,
    careerGrowthBody: field(formData, "careerGrowthBody") || d.careerGrowthBody,
    careerGrowthClosing: field(formData, "careerGrowthClosing") || d.careerGrowthClosing,
    mamasValuesTagline: field(formData, "mamasValuesTagline") || d.mamasValuesTagline,
    mamasValuesDescriptions:
      mamasValuesDescriptions.length === 5
        ? (mamasValuesDescriptions as [string, string, string, string, string])
        : d.mamasValuesDescriptions,
    mamasValuesClosing: field(formData, "mamasValuesClosing") || d.mamasValuesClosing,
    whoThrivesHeading: field(formData, "whoThrivesHeading") || d.whoThrivesHeading,
    whoThrivesItems: whoThrivesItems.length > 0 ? whoThrivesItems : d.whoThrivesItems,
    notRightFitHeading: field(formData, "notRightFitHeading") || d.notRightFitHeading,
    notRightFitIntro: notRightFitIntro.length > 0 ? notRightFitIntro : d.notRightFitIntro,
    notRightFitItems: notRightFitItems.length > 0 ? notRightFitItems : d.notRightFitItems,
    notRightFitClosing: field(formData, "notRightFitClosing") || d.notRightFitClosing,
    faqs: faqs.length > 0 ? faqs : d.faqs,
    finalCtaHeadline: field(formData, "finalCtaHeadline") || d.finalCtaHeadline,
    finalCtaBody: field(formData, "finalCtaBody") || d.finalCtaBody,
    finalCtaButtonLabel: field(formData, "finalCtaButtonLabel") || d.finalCtaButtonLabel,
  };

  await setCareersV2Content(content);
  revalidatePath("/recruiting/careers-content");
  revalidatePath("/careers");
}

export async function resetCareersV2ContentAction() {
  await requireAdmin();
  await resetCareersV2Content();
  revalidatePath("/recruiting/careers-content");
  revalidatePath("/careers");
}
