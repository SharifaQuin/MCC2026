import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getRookieContentAccess,
  getRookieContentItem,
  getRookieDayReview,
} from "@/lib/rookieJourney";
import { requireOnboardingComplete } from "@/lib/onboarding";
import { t } from "@/lib/i18n";
import RookieContentPageBody from "./RookieContentPageBody";

export default async function RookieContentPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");
  await requireOnboardingComplete(session);
  const labels = t(session.language);

  const access = await getRookieContentAccess(session.sub, params.id);
  if (!access.allowed) redirect("/");

  const item = await getRookieContentItem(params.id);
  if (!item) notFound();

  const dayReview = await getRookieDayReview(session.sub, item.rookieDay.dayNumber);
  const entry = dayReview?.sequence.find((s) => s.id === params.id);
  if (!entry || entry.kind === "LESSON") notFound();

  const lang = session.language;
  const title = lang === "ES" && entry.titleEs ? entry.titleEs : entry.titleEn;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          {labels.rookieBackToJourney}
        </Link>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>

      <RookieContentPageBody
        contentItemId={params.id}
        kind={entry.kind as "PRACTICAL_LESSON" | "SCENARIO" | "RECAP" | "ORIENTATION"}
        titleEn={entry.titleEn}
        titleEs={entry.titleEs}
        bodyEn={entry.bodyEn}
        bodyEs={entry.bodyEs}
        promptEn={entry.promptEn}
        promptEs={entry.promptEs}
        revealEn={entry.revealEn}
        revealEs={entry.revealEs}
        hasFutureVideoSlot={entry.hasFutureVideoSlot}
        videos={entry.videos}
        completed={entry.completed}
        nextHref={access.nextHref ?? "/"}
        language={lang}
      />
    </div>
  );
}
