import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { connectQuickBooks, QBO_OAUTH_STATE_COOKIE } from "@/lib/quickbooks";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new NextResponse("Not authorized", { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const state = searchParams.get("state");
  const expectedState = cookies().get(QBO_OAUTH_STATE_COOKIE)?.value;
  cookies().delete(QBO_OAUTH_STATE_COOKIE);

  if (!code || !realmId || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/financials?quickbooks=error", req.url));
  }

  try {
    await connectQuickBooks({ code, realmId, connectedById: session.sub });
  } catch (error) {
    console.error("QuickBooks connect failed:", error);
    return NextResponse.redirect(new URL("/financials?quickbooks=error", req.url));
  }

  return NextResponse.redirect(new URL("/financials?quickbooks=connected", req.url));
}
