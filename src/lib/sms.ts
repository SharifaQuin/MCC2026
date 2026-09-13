// Sends SMS via RingCentral, using a Server-to-Server (JWT) app. Requires
// RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, RINGCENTRAL_JWT, and
// RINGCENTRAL_FROM_NUMBER as env vars — see the Recruiting setup notes for
// how to create the app and JWT credential in the RingCentral developer
// console.
export async function sendSms({
  to,
  text,
}: {
  to: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const server = process.env.RINGCENTRAL_SERVER_URL ?? "https://platform.ringcentral.com";
  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const jwt = process.env.RINGCENTRAL_JWT;
  const fromNumber = process.env.RINGCENTRAL_FROM_NUMBER;

  if (!clientId || !clientSecret || !jwt || !fromNumber) {
    return {
      ok: false,
      error:
        "Text sending isn't configured yet — missing RINGCENTRAL_CLIENT_ID / RINGCENTRAL_CLIENT_SECRET / RINGCENTRAL_JWT / RINGCENTRAL_FROM_NUMBER.",
    };
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch(`${server}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    return { ok: false, error: `RingCentral auth failed: ${await tokenRes.text()}` };
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const smsRes = await fetch(
    `${server}/restapi/v1.0/account/~/extension/~/sms`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { phoneNumber: fromNumber },
        to: [{ phoneNumber: to }],
        text,
      }),
    }
  );

  if (!smsRes.ok) {
    return { ok: false, error: `RingCentral SMS send failed: ${await smsRes.text()}` };
  }
  return { ok: true };
}
