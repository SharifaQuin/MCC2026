import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { getRecruitingExperienceVersion, getRecruitingVideoUrl } from "@/lib/recruiting";
import {
  setRecruitingExperienceVersionAction,
  setRecruitingVideoUrlAction,
} from "@/app/actions/recruitingExperience";

export default async function RecruitingExperiencePage() {
  await requireRecruitingAccess();
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/recruiting");

  const [version, videoUrl] = await Promise.all([
    getRecruitingExperienceVersion(),
    getRecruitingVideoUrl(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
        ← Back to Recruiting
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-semibold">Careers Page Experience</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Controls what every visitor to the public{" "}
        <a href="/careers" target="_blank" rel="noopener noreferrer" className="underline">
          /careers
        </a>{" "}
        page sees. Switching drafts doesn&apos;t touch any applicant data, job postings, or the
        recruiting pipeline — it only changes the public page&apos;s look and content.
      </p>

      <form
        action={setRecruitingExperienceVersionAction}
        className="mb-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-6"
      >
        <p className="font-medium text-neutral-900">Active Version</p>
        <label className="flex items-start gap-3 rounded-md border border-neutral-200 p-3 hover:bg-neutral-50">
          <input
            type="radio"
            name="version"
            value="v1"
            defaultChecked={version === "v1"}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-neutral-900">Draft 1 (Original)</span>
            <span className="block text-sm text-neutral-500">
              The current careers page — simple hero, values grid, open positions list.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-md border border-neutral-200 p-3 hover:bg-neutral-50">
          <input
            type="radio"
            name="version"
            value="v2"
            defaultChecked={version === "v2"}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-neutral-900">Draft 2 (Recruiting 2.0)</span>
            <span className="block text-sm text-neutral-500">
              The redesigned careers experience — recruiting video, career growth ladder,
              realistic job preview, our story, MAMAS core values, and FAQ.
            </span>
          </span>
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
        >
          Save
        </button>
      </form>

      <form
        action={setRecruitingVideoUrlAction}
        className="space-y-3 rounded-lg border border-neutral-200 bg-white p-6"
      >
        <p className="font-medium text-neutral-900">Recruiting Video (Draft 2 only)</p>
        <p className="text-sm text-neutral-500">
          Paste a YouTube, Vimeo, Loom, or Synthesia link (a normal share link is fine — it's
          automatically converted to its embeddable form). Until this is set, Draft 2 shows a
          placeholder in place of the video — never a fake or stock clip.
        </p>

        <div className="aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
          {videoUrl ? (
            <iframe
              src={videoUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center text-neutral-400">
              <span className="text-2xl">🎬</span>
              <p className="text-xs font-medium">Recruiting Video Not Yet Added</p>
            </div>
          )}
        </div>

        <input
          name="videoUrl"
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          defaultValue={videoUrl ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Save Video URL
        </button>
      </form>

      <Link
        href="/recruiting/careers-content"
        className="mt-6 block rounded-lg border border-neutral-200 bg-white p-6 hover:border-gold-400 hover:shadow-sm"
      >
        <p className="font-medium text-neutral-900">Edit Careers Page Copy →</p>
        <p className="mt-1 text-sm text-neutral-500">
          Rewrite every sentence on the Draft 2 careers page — hero, story, job description, FAQ, and
          more — without a code change.
        </p>
      </Link>
    </div>
  );
}
