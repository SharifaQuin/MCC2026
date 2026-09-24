import { prisma } from "@/lib/prisma";
import { getRecruitingExperienceVersion, getRecruitingVideoUrl } from "@/lib/recruiting";
import CareersPageV1 from "./CareersPageV1";
import CareersPageV2 from "./CareersPageV2";

// Job postings change over time, so this needs a live DB query on every
// request rather than being frozen at build time — and the build step
// doesn't have a database to query anyway.
export const dynamic = "force-dynamic";

export default async function CareersPage() {
  const [postings, version, videoUrl] = await Promise.all([
    prisma.jobPosting.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      select: { slug: true, titleEn: true, positionType: true },
    }),
    getRecruitingExperienceVersion(),
    getRecruitingVideoUrl(),
  ]);

  if (version === "v2") {
    return <CareersPageV2 postings={postings} videoUrl={videoUrl} />;
  }

  return <CareersPageV1 postings={postings} />;
}
