import Link from "next/link";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { createJobPostingAction } from "../../actions";

export default async function NewJobPostingPage() {
  await requireRecruitingAccess();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
        ← Back to Recruiting
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold">New Job Posting</h1>

      <form action={createJobPostingAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Title *</label>
          <input
            name="titleEn"
            required
            placeholder="e.g. Residential Cleaning Technician"
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Position Type</label>
          <input
            name="positionType"
            placeholder="e.g. Full-Time, Field"
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Description (shown to applicants)
          </label>
          <textarea
            name="descriptionEn"
            rows={6}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Prescreen Pass Threshold (%)
          </label>
          <input
            type="number"
            name="passThresholdPct"
            defaultValue={70}
            min={0}
            max={100}
            className="w-32 rounded-md border border-neutral-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Applicants scoring at or above this percentage on the prescreening questions
            automatically pass and can be invited to schedule an interview.
          </p>
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
        >
          Create Posting
        </button>
      </form>
    </div>
  );
}
