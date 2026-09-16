import Link from "next/link";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { getInterviewLogistics } from "@/lib/recruiting";
import { saveInterviewLogisticsAction } from "../actions";

export default async function InterviewSettingsPage() {
  const { canEdit } = await requireRecruitingAccess();
  const logistics = await getInterviewLogistics();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
        ← Back to Recruiting
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-semibold">Interview Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        This address, phone number, and arrival instructions are automatically included in
        every in-person interview confirmation email — in English and Spanish. Only the
        position name changes per job posting (edit that on the posting itself).
      </p>

      <form
        action={saveInterviewLogisticsAction}
        className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Interview Address
          </label>
          <textarea
            name="address"
            defaultValue={logistics.address}
            rows={2}
            required
            disabled={!canEdit}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Contact Phone
          </label>
          <input
            name="phone"
            defaultValue={logistics.phone}
            required
            disabled={!canEdit}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Arrival Instructions (English)
          </label>
          <textarea
            name="arrivalInstructionsEn"
            defaultValue={logistics.arrivalInstructionsEn}
            rows={4}
            required
            disabled={!canEdit}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Arrival Instructions (Spanish)
          </label>
          <textarea
            name="arrivalInstructionsEs"
            defaultValue={logistics.arrivalInstructionsEs}
            rows={4}
            required
            disabled={!canEdit}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
          />
        </div>
        {canEdit && (
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
          >
            Save
          </button>
        )}
      </form>
    </div>
  );
}
