import { prisma } from "@/lib/prisma";
import { getRecruitingExperienceVersion, getRecruitingVideoUrl, getCareersV2Content, type CareersLocale } from "@/lib/recruiting";
import CareersPageV1 from "./CareersPageV1";
import CareersPageV2 from "./CareersPageV2";

// Job postings change over time, so this needs a live DB query on every
// request rather than being frozen at build time — and the build step
// doesn't have a database to query anyway.
export const dynamic = "force-dynamic";

export default async function CareersPage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  const locale: CareersLocale = searchParams?.lang === "es" ? "es" : "en";

  const [postings, version, videoUrl] = await Promise.all([
    prisma.jobPosting.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      select: { slug: true, titleEn: true, titleEs: true, positionType: true, descriptionEn: true },
    }),
    getRecruitingExperienceVersion(),
    getRecruitingVideoUrl(),
  ]);

  if (version === "v2") {
    const content = await getCareersV2Content(locale);
    const localizedPostings = postings.map((p) => ({
      ...p,
      titleEn: locale === "es" && p.titleEs ? p.titleEs : p.titleEn,
    }));
    return <CareersPageV2 postings={localizedPostings} videoUrl={videoUrl} content={content} locale={locale} />;
  }

  return <CareersPageV1 postings={postings} />;
}
