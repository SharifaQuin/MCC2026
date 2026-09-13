// Minimal Slack Web API client — just enough to post the Monday Team Update
// and DM the owner about failures/missed approvals. Requires SLACK_BOT_TOKEN
// (a bot token with the chat:write scope) and SLACK_TEAM_CHANNEL_ID; see the
// setup steps the owner was given for creating the Slack app and inviting
// the bot to the team channel.
const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

async function postSlackMessage(channel: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured.");

  const res = await fetch(SLACK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text, mrkdwn: true }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}

export async function postToSlackTeamChannel(text: string): Promise<void> {
  const channel = process.env.SLACK_TEAM_CHANNEL_ID;
  if (!channel) throw new Error("SLACK_TEAM_CHANNEL_ID is not configured.");
  await postSlackMessage(channel, text);
}

// Best-effort DM to the owner (missed approval, send failure) — silently
// does nothing without OWNER_SLACK_USER_ID, since it's a nice-to-have alert
// rather than a required part of the flow, and never throws itself.
export async function postSlackDMToOwner(text: string): Promise<void> {
  const user = process.env.OWNER_SLACK_USER_ID;
  if (!user) return;
  try {
    await postSlackMessage(user, text);
  } catch {
    // An alert about a failure shouldn't itself be able to fail loudly.
  }
}

export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_TEAM_CHANNEL_ID);
}
