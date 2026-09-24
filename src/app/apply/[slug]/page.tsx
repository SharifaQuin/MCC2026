import { prisma } from "@/lib/prisma";
import Logo from "@/components/Logo";
import { getRecruitingExperienceVersion, parseUtmParams } from "@/lib/recruiting";
import ApplyPageV1 from "./ApplyPageV1";
import ApplyPageV2 from "./ApplyPageV2";

const ERROR_MESSAGES: Record<string, string> = {
  closed: "This position is no longer accepting applications.",
  incomplete: "Please fill out every field, attach your resume, and answer every question.",
  duplicate:
    "It looks like we already have an application on file from this email address for this position — we'll be in touch soon!",
};

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { error?: string; src?: string; [key: string]: string | string[] | undefined };
}) {
  const posting = await prisma.jobPosting.findUnique({
    where: { slug: params.slug },
    include: { prescreenQuestions: { include: { options: true }, orderBy: { order: "asc" } } },
  });

  if (!posting || !posting.active) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Logo />
        <p className="mt-6 text-lg text-neutral-600">
          This position is no longer accepting applications. Check back soon for other openings!
        </p>
      </div>
    );
  }

  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;
  const src = typeof searchParams.src === "string" ? searchParams.src : "";
  const version = await getRecruitingExperienceVersion();

  if (version === "v2") {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string") usp.set(key, value);
    }
    const utm = parseUtmParams(usp);

    return (
      <ApplyPageV2
        posting={posting}
        slug={params.slug}
        src={src}
        utm={utm}
        errorMessage={errorMessage}
      />
    );
  }

  return <ApplyPageV1 posting={posting} slug={params.slug} src={src} errorMessage={errorMessage} />;
}
