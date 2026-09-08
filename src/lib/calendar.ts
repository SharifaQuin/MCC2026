import { getGraphAccessToken } from "@/lib/msGraph";

// Creates an event on the shared Outlook calendar via Microsoft Graph, using
// the same app registration as email sending — requires the app to also
// have the Calendars.ReadWrite application permission granted (in addition
// to Mail.Send) in the Entra ID app registration.
export async function createCalendarEvent({
  subject,
  startsAt,
  durationMinutes = 30,
  body,
  attendeeEmail,
  attendeeName,
}: {
  subject: string;
  startsAt: Date;
  durationMinutes?: number;
  body: string;
  attendeeEmail: string;
  attendeeName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getGraphAccessToken();
  if (!token.ok) return token;

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(token.senderEmail)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        body: { contentType: "Text", content: body },
        start: { dateTime: startsAt.toISOString(), timeZone: "UTC" },
        end: { dateTime: endsAt.toISOString(), timeZone: "UTC" },
        attendees: [
          {
            emailAddress: { address: attendeeEmail, name: attendeeName },
            type: "required",
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    return {
      ok: false,
      error: `Microsoft Graph calendar event creation failed: ${await res.text()}`,
    };
  }
  return { ok: true };
}
