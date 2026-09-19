import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getQuickBooksAuthorizeUrl, isQuickBooksConfigured, QBO_OAUTH_STATE_COOKIE } from "@/lib/quickbooks";

// Kicks off the OAuth dance — ADMIN clicks "Connect QuickBooks" on
// /financials, lands here, gets redirected to Intuit's consent screen.
// The random state value is stashed in a short-lived cookie and checked
// again in the callback route, as a CSRF guard on the redirect back.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new NextResponse("Not authorized", { status: 403 });
  }
  if (!isQuickBooksConfigured()) {
    return new NextResponse(
      "QuickBooks isn't configured yet — missing QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET.",
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();
  cookies().set(QBO_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(getQuickBooksAuthorizeUrl(state));
}
