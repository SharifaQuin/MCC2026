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
  location,
  attendeeEmail,
  attendeeName,
}: {
  mailbox: string;
  subject: string;
  startsAt: Date;
  durationMinutes?: number;
  body: string;
  // Plain address text for an in-person interview — populates the event's
  // own Location field (what actually shows next to the time in Outlook/
  // calendar apps), separate from and in addition to the body text.
  // Omitted entirely for a Zoom interview.
  location?: string;
  attendeeEmail: string;
  attendeeName: string;
}): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
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
        ...(location ? { location: { displayName: location } } : {}),
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
  const created = (await res.json()) as { id: string };
  return { ok: true, eventId: created.id };
}

// Moves an existing event (created by createCalendarEvent, whose id was
// saved) to a new time and refreshes its body — used on a reschedule so the
// shared calendar shows one updated event rather than a stale duplicate
// alongside a new one. Best-effort, same conventions as createCalendarEvent:
// never throws, callers decide whether to fall back to creating a fresh
// event when this fails (e.g. the original event or mailbox no longer
// exists).
export async function updateCalendarEvent({
  mailbox,
  eventId,
  subject,
  startsAt,
  durationMinutes = 30,
  body,
  location,
}: {
  mailbox: string;
  eventId: string;
  subject?: string;
  startsAt: Date;
  durationMinutes?: number;
  body?: string;
  // See createCalendarEvent's `location` — omitted leaves the event's
  // existing Location field as-is; pass the current address explicitly on
  // every in-person reschedule, same as body/subject already are.
  location?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getGraphAccessToken();
  if (!token.ok) return token;

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(subject ? { subject } : {}),
        ...(body ? { body: { contentType: "Text", content: body } } : {}),
        ...(location ? { location: { displayName: location } } : {}),
        start: { dateTime: startsAt.toISOString(), timeZone: "UTC" },
        end: { dateTime: endsAt.toISOString(), timeZone: "UTC" },
      }),
    }
  );

  if (!res.ok) {
    return {
      ok: false,
      error: `Microsoft Graph calendar event update failed: ${await res.text()}`,
    };
  }
  return { ok: true };
}

// Cancels/removes a previously created event — used wherever an interview is
// cancelled outright rather than rescheduled. Best-effort, never throws.
export async function deleteCalendarEvent({
  mailbox,
  eventId,
}: {
  mailbox: string;
  eventId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getGraphAccessToken();
  if (!token.ok) return token;

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.accessToken}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    return {
      ok: false,
      error: `Microsoft Graph calendar event deletion failed: ${await res.text()}`,
    };
  }
  return { ok: true };
}
