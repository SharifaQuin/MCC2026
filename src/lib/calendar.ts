import { getGraphAccessToken } from "@/lib/msGraph";

// Creates an event on a real (licensed, non-shared) mailbox's Outlook
// calendar via Microsoft Graph, using the same app registration as email
// sending — requires the app to also have the Calendars.ReadWrite
// application permission granted (in addition to Mail.Send) in the Entra ID
// app registration. The mailbox is independent of the email-sending
// mailbox, since a shared mailbox (like the one email sends from) has no
// calendar of its own.
export async function createCalendarEvent({
  mailbox,
  subject,
  startsAt,
  durationMinutes = 30,
  body,
  attendeeEmail,
  attendeeName,
}: {
  mailbox: string;
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
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/events`,
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
