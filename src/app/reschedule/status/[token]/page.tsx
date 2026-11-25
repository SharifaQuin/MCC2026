import { prisma } from "@/lib/prisma";
import { hashStatusToken, TYPE_LABELS, ARRIVAL_WINDOW_LABELS, FREQUENCY_LABELS } from "@/lib/rescheduleRequests";
import Logo from "@/components/Logo";

export const metadata = {
  robots: { index: false, follow: false },
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

export default async function RescheduleStatusPage({ params }: { params: { token: string } }) {
  const hash = hashStatusToken(params.token);
  const request = await prisma.rescheduleRequest.findUnique({ where: { statusTokenHash: hash } });

  const now = new Date();
  const valid =
    !!request &&
    !request.statusTokenRevokedAt &&
    (!request.statusTokenExpiresAt || request.statusTokenExpiresAt > now);

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" withTagline />
        </div>

        {!valid ? (
          <p className="text-center text-sm text-neutral-500">
            This link is no longer valid — please contact us if you need an update on a schedule change request.
          </p>
        ) : (
          <>
            <h1 className="text-lg font-bold text-neutral-900">Your schedule change request</h1>

            <dl className="mt-4 space-y-2 text-sm text-neutral-700">
              <div>
                <dt className="font-medium text-neutral-900">Request</dt>
                <dd>{TYPE_LABELS[request.type]}</dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-900">Current appointment date</dt>
                <dd>{formatDate(request.currentAppointmentDate)}</dd>
              </div>
              {request.chosenOptionDate && (
                <div>
                  <dt className="font-medium text-neutral-900">Requested time</dt>
                  <dd>
                    {formatDate(request.chosenOptionDate)} · {request.chosenOptionBlock}
                  </dd>
                </div>
              )}
              {!request.chosenOptionDate && request.preferredDateText && (
                <div>
                  <dt className="font-medium text-neutral-900">Preferred date</dt>
                  <dd>{request.preferredDateText}</dd>
                </div>
              )}
              {request.arrivalWindow && (
                <div>
                  <dt className="font-medium text-neutral-900">Arrival window preference</dt>
                  <dd>{ARRIVAL_WINDOW_LABELS[request.arrivalWindow]}</dd>
                </div>
              )}
              {request.frequency && (
                <div>
                  <dt className="font-medium text-neutral-900">Frequency requested</dt>
                  <dd>{FREQUENCY_LABELS[request.frequency]}</dd>
                </div>
              )}
            </dl>

            <div className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm">
              {request.decision === "APPROVED" ? (
                <>
                  <p className="font-medium text-green-800">Confirmed</p>
                  <dl className="mt-2 space-y-2 text-neutral-700">
                    {request.confirmedDate && (
                      <div>
                        <dt className="font-medium text-neutral-900">Confirmed date</dt>
                        <dd>{formatDate(request.confirmedDate)}</dd>
                      </div>
                    )}
                    {request.confirmedWindow && (
                      <div>
                        <dt className="font-medium text-neutral-900">Confirmed window</dt>
                        <dd>{request.confirmedWindow}</dd>
                      </div>
                    )}
                    {request.confirmedOriginalOutcome && (
                      <div>
                        <dt className="font-medium text-neutral-900">Your original appointment</dt>
                        <dd>{request.confirmedOriginalOutcome}</dd>
                      </div>
                    )}
                    {request.confirmedRecurrenceText && (
                      <div>
                        <dt className="font-medium text-neutral-900">Going forward</dt>
                        <dd>{request.confirmedRecurrenceText}</dd>
                      </div>
                    )}
                  </dl>
                </>
              ) : request.decision === "DECLINED" ? (
                <>
                  <p className="font-medium text-red-800">Not approved</p>
                  {request.closeNote && <p className="mt-2 text-neutral-700">{request.closeNote}</p>}
                </>
              ) : (
                <p className="text-neutral-700">
                  Not approved yet. Your current appointment stays scheduled unless we confirm a change.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
