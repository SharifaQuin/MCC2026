import { prisma } from "@/lib/prisma";

// Sandbox first, always — flip QUICKBOOKS_ENVIRONMENT to "production" only
// once the whole flow has been proven against a test company. Intuit uses
// entirely separate app credentials, base URLs, and OAuth authorize hosts
// per environment.
const ENVIRONMENT = process.env.QUICKBOOKS_ENVIRONMENT === "production" ? "production" : "sandbox";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API_BASE =
  ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

const SCOPE = "com.intuit.quickbooks.accounting";

// Route Handler files can only export GET/POST/etc — this lives here
// instead of in the connect route itself so both it and the callback
// route can reference the same cookie name.
export const QBO_OAUTH_STATE_COOKIE = "qbo_oauth_state";

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${appUrl}/api/quickbooks/callback`;
}

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("QuickBooks isn't configured — missing QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

export function isQuickBooksConfigured(): boolean {
  return !!(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);
}

export function getQuickBooksAuthorizeUrl(state: string): string {
  const { clientId } = getClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: SCOPE,
    redirect_uri: getRedirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds, access token — always 3600 per Intuit's docs
  x_refresh_token_expires_in: number; // seconds, refresh token — ~100 days
}

function tokensFromResponse(body: TokenResponse) {
  const now = Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    accessTokenExpiresAt: new Date(now + body.expires_in * 1000),
    refreshTokenExpiresAt: new Date(now + body.x_refresh_token_expires_in * 1000),
  };
}

async function requestTokens(params: Record<string, string>, attempt = 1): Promise<ReturnType<typeof tokensFromResponse>> {
  const { clientId, clientSecret } = getClientCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  // Retry once on a transient failure (network error, or a 5xx from Intuit's
  // side) — but never on a 4xx like invalid_grant, since that means the
  // refresh/auth code itself is dead and a retry won't fix it.
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params),
    });
  } catch (networkError) {
    if (attempt === 1) return requestTokens(params, 2);
    throw networkError;
  }

  if (!res.ok) {
    if (res.status >= 500 && attempt === 1) {
      return requestTokens(params, 2);
    }
    throw new Error(`QuickBooks token request failed: ${await res.text()}`);
  }
  return tokensFromResponse((await res.json()) as TokenResponse);
}

// Exchanges the one-time authorization code from the OAuth redirect for a
// real access/refresh token pair, then saves (or replaces) the single
// QuickBooksConnection row. Called once, from the /api/quickbooks/callback
// route handler.
export async function connectQuickBooks(params: {
  code: string;
  realmId: string;
  connectedById: string;
}): Promise<void> {
  const tokens = await requestTokens({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: getRedirectUri(),
  });

  await prisma.quickBooksConnection.upsert({
    where: { realmId: params.realmId },
    create: { realmId: params.realmId, connectedById: params.connectedById, ...tokens },
    update: { ...tokens, connectedById: params.connectedById },
  });
}

export async function getQuickBooksConnection() {
  return prisma.quickBooksConnection.findFirst({
    orderBy: { createdAt: "desc" },
    include: { connectedBy: { select: { name: true } } },
  });
}

export async function disconnectQuickBooks(): Promise<void> {
  await prisma.quickBooksConnection.deleteMany({});
}

// Thrown when the refresh token itself is dead — expired (~100 days
// unused), revoked, or the customer disconnected the app from Intuit's
// side. There's no fixing this without the owner clicking "Connect
// QuickBooks" again, so callers should catch this and say so rather than
// surface a raw error.
export class QuickBooksReauthRequiredError extends Error {
  constructor() {
    super("QuickBooks needs to be reconnected.");
    this.name = "QuickBooksReauthRequiredError";
  }
}

// Refreshes and returns a usable access token, lazily — refreshes only
// when the current one is expired (or about to be, within 2 minutes).
// QuickBooks refresh tokens are single-use: every refresh returns a brand
// new refresh token that MUST overwrite the old one, or the next refresh
// will fail. Returns null if there's no connection at all.
export async function getValidAccessToken(): Promise<{ accessToken: string; realmId: string } | null> {
  const connection = await prisma.quickBooksConnection.findFirst({ orderBy: { createdAt: "desc" } });
  if (!connection) return null;

  const twoMinutesFromNow = new Date(Date.now() + 2 * 60 * 1000);
  if (connection.accessTokenExpiresAt > twoMinutesFromNow) {
    return { accessToken: connection.accessToken, realmId: connection.realmId };
  }

  let tokens;
  try {
    tokens = await requestTokens({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    });
  } catch (error) {
    // Clearing the stale connection makes the "Connect QuickBooks" button
    // reappear on /financials, instead of silently failing on every future
    // pull with the same dead refresh token.
    await prisma.quickBooksConnection.delete({ where: { id: connection.id } });
    throw new QuickBooksReauthRequiredError();
  }

  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: tokens,
  });

  return { accessToken: tokens.accessToken, realmId: connection.realmId };
}

export interface ProfitAndLossSummary {
  totalIncome: number;
  totalCogs: number;
  grossProfit: number;
  totalExpenses: number;
  netIncome: number;
}

// QuickBooks' Report API returns a deeply nested Rows.Row[] tree — this
// walks it looking for the named summary sections every P&L report has
// (Income / COGS / GrossProfit / Expenses / NetIncome), regardless of how
// the company's own chart of accounts is organized underneath them. Those
// five numbers are reliable across any QuickBooks company; the individual
// line items inside each section are not (see the "Pull from QuickBooks"
// UI note — that's why this only fetches the top-line totals).
function findSummaryAmount(rows: unknown, group: string): number | null {
  if (!rows || typeof rows !== "object") return null;
  const rowList = (rows as { Row?: unknown[] }).Row;
  if (!Array.isArray(rowList)) return null;

  for (const row of rowList) {
    if (!row || typeof row !== "object") continue;
    const r = row as { group?: string; Summary?: { ColData?: { value?: string }[] }; Rows?: unknown };

    if (r.group === group && r.Summary?.ColData?.length) {
      const last = r.Summary.ColData[r.Summary.ColData.length - 1];
      const parsed = Number(last?.value);
      if (!Number.isNaN(parsed)) return parsed;
    }

    if (r.Rows) {
      const nested = findSummaryAmount(r.Rows, group);
      if (nested !== null) return nested;
    }
  }
  return null;
}

// Fetches a Profit and Loss report for the given date range (YYYY-MM-DD)
// and pulls out just the five top-line totals. Returns null (rather than
// throwing) if the report shape doesn't match what's expected, so a
// QuickBooks quirk never surfaces as a raw crash on the Financials page —
// the owner just won't see a "Pull from QuickBooks" result for that month.
export async function fetchProfitAndLossSummary(
  startDate: string,
  endDate: string
): Promise<ProfitAndLossSummary | null> {
  const auth = await getValidAccessToken();
  if (!auth) return null;

  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    accounting_method: "Accrual",
    minorversion: "65",
  });
  const res = await fetch(
    `${API_BASE}/v3/company/${auth.realmId}/reports/ProfitAndLoss?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) return null;

  const report = (await res.json()) as { Rows?: unknown };
  const totalIncome = findSummaryAmount(report.Rows, "Income");
  const totalCogs = findSummaryAmount(report.Rows, "COGS");
  const grossProfit = findSummaryAmount(report.Rows, "GrossProfit");
  const totalExpenses = findSummaryAmount(report.Rows, "Expenses");
  const netIncome = findSummaryAmount(report.Rows, "NetIncome");

  if (totalIncome === null || totalExpenses === null || netIncome === null) return null;

  return {
    totalIncome,
    totalCogs: totalCogs ?? 0,
    grossProfit: grossProfit ?? totalIncome - (totalCogs ?? 0),
    totalExpenses,
    netIncome,
  };
}
