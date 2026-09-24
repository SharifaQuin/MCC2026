import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { formatInBusinessTimezone } from "@/lib/timezone";
import PageHeader from "@/components/ds/PageHeader";
import Card from "@/components/ds/Card";
import { EmptyState } from "@/components/ds/EmptyState";
import AvailabilitySlotForm from "./AvailabilitySlotForm";
import DeleteSlotButton from "./DeleteSlotButton";

export const dynamic = "force-dynamic";

export default async function InterviewAvailabilityPage() {
  await requireRecruitingAccess();

  const [openSlots, bookedSlots, postings] = await Promise.all([
    prisma.interviewAvailabilitySlot.findMany({
      where: { bookedById: null, startsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
      include: { jobPosting: { select: { titleEn: true } } },
    }),
    prisma.interviewAvailabilitySlot.findMany({
      where: { bookedById: { not: null } },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: {
        bookedApplicant: { select: { id: true, firstName: true, lastName: true } },
        jobPosting: { select: { titleEn: true } },
      },
    }),
    prisma.jobPosting.findMany({ where: { active: true }, select: { id: true, titleEn: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Recruiting 2.0"
        title="Interview Availability"
        description="Add specific times you're available to interview — candidates can only book from these. This is not an open calendar."
        actions={
          <Link href="/recruiting/inbox" className="text-sm font-medium text-brand-600 hover:underline">
            ← Recruiting Inbox
          </Link>
        }
      />

      <Card>
        <AvailabilitySlotForm postings={postings} />
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Open Slots ({openSlots.length})
        </h2>
        {openSlots.length === 0 ? (
          <EmptyState title="No open slots" description="Add a time above so an invited candidate has something to book." />
        ) : (
          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
            {openSlots.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-brand-800">{formatInBusinessTimezone(slot.startsAt)}</p>
                  <p className="text-xs text-neutral-500">
                    {slot.durationMins} min{slot.jobPosting ? ` · ${slot.jobPosting.titleEn} only` : " · General availability"}
                  </p>
                </div>
                <DeleteSlotButton slotId={slot.id} />
              </div>
            ))}
          </div>
        )}
      </div>

      {bookedSlots.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Recently Booked</h2>
          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
            {bookedSlots.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-brand-800">{formatInBusinessTimezone(slot.startsAt)}</p>
                  <p className="text-xs text-neutral-500">
                    {slot.bookedApplicant ? `${slot.bookedApplicant.firstName} ${slot.bookedApplicant.lastName}` : "—"}
                  </p>
                </div>
                {slot.bookedApplicant && (
                  <Link
                    href={`/recruiting/applicants/${slot.bookedApplicant.id}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    View →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
