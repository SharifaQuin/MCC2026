import { test, expect } from "@playwright/test";
import { sendEmail } from "../src/lib/email";

// A genuinely mocked SUCCESSFUL transport, unlike the rest of this suite's
// "fails closed because MS_GRAPH_* isn't configured in this environment"
// tests — this one calls sendEmail() directly (in this test process, never
// the running app server) with global.fetch monkey-patched to a fake
// Microsoft Graph, so the exact recipient/subject/body/from/bcc/replyTo
// reaching the (mocked) wire, and the exact call count, can be asserted —
// not just "a request happened." MS_GRAPH_* env vars are set only for the
// duration of this file's tests and restored after, so nothing else in the
// suite (which legitimately relies on them being absent) is affected.
const ORIGINAL_ENV = {
  MS_GRAPH_TENANT_ID: process.env.MS_GRAPH_TENANT_ID,
  MS_GRAPH_CLIENT_ID: process.env.MS_GRAPH_CLIENT_ID,
  MS_GRAPH_CLIENT_SECRET: process.env.MS_GRAPH_CLIENT_SECRET,
  MS_GRAPH_SENDER_EMAIL: process.env.MS_GRAPH_SENDER_EMAIL,
};
const ORIGINAL_FETCH = global.fetch;

test.describe("sendEmail() — mocked successful Microsoft Graph transport", () => {
  test.beforeEach(() => {
    process.env.MS_GRAPH_TENANT_ID = "test-tenant";
    process.env.MS_GRAPH_CLIENT_ID = "test-client";
    process.env.MS_GRAPH_CLIENT_SECRET = "test-secret";
    process.env.MS_GRAPH_SENDER_EMAIL = "sales@mamascleaningcrew.com";
  });

  test.afterEach(() => {
    process.env.MS_GRAPH_TENANT_ID = ORIGINAL_ENV.MS_GRAPH_TENANT_ID;
    process.env.MS_GRAPH_CLIENT_ID = ORIGINAL_ENV.MS_GRAPH_CLIENT_ID;
    process.env.MS_GRAPH_CLIENT_SECRET = ORIGINAL_ENV.MS_GRAPH_CLIENT_SECRET;
    process.env.MS_GRAPH_SENDER_EMAIL = ORIGINAL_ENV.MS_GRAPH_SENDER_EMAIL;
    global.fetch = ORIGINAL_FETCH;
  });

  test("dispatches exactly once, to the exact recipient, with the exact subject/body/from/bcc/replyTo", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "fake-access-token" }), { status: 200 });
      }
      if (String(url).includes("/sendMail")) {
        return new Response(null, { status: 202 });
      }
      throw new Error("Unexpected fetch call in mocked transport test: " + url);
    }) as typeof fetch;

    const result = await sendEmail({
      to: "exact-recipient@example.com",
      subject: "Exact Subject Line",
      body: "Exact body content.",
      from: "sales@mamascleaningcrew.com",
      bcc: "sales@mamascleaningcrew.com",
      replyTo: "sales@mamascleaningcrew.com",
    });

    expect(result.ok).toBe(true);

    const tokenCalls = calls.filter((c) => c.url.includes("/oauth2/v2.0/token"));
    const sendCalls = calls.filter((c) => c.url.includes("/sendMail"));
    expect(tokenCalls.length).toBe(1);
    expect(sendCalls.length).toBe(1);

    const sendCall = sendCalls[0];
    expect(sendCall.url).toContain(encodeURIComponent("sales@mamascleaningcrew.com"));
    const payload = JSON.parse(String(sendCall.init.body));
    expect(payload.message.subject).toBe("Exact Subject Line");
    expect(payload.message.body.content).toContain("Exact body content.");
    expect(payload.message.toRecipients).toEqual([{ emailAddress: { address: "exact-recipient@example.com" } }]);
    expect(payload.message.bccRecipients).toEqual([{ emailAddress: { address: "sales@mamascleaningcrew.com" } }]);
    expect(payload.message.replyTo).toEqual([{ emailAddress: { address: "sales@mamascleaningcrew.com" } }]);
  });

  test("a token-fetch failure surfaces as ok:false without ever reaching sendMail", async () => {
    let sendMailCalled = false;
    global.fetch = (async (url: string | URL) => {
      if (String(url).includes("/oauth2/v2.0/token")) {
        return new Response("invalid_client", { status: 401 });
      }
      if (String(url).includes("/sendMail")) {
        sendMailCalled = true;
        return new Response(null, { status: 202 });
      }
      throw new Error("Unexpected fetch call: " + url);
    }) as typeof fetch;

    const result = await sendEmail({ to: "x@example.com", subject: "s", body: "b" });
    expect(result.ok).toBe(false);
    expect(sendMailCalled).toBe(false);
  });
});
