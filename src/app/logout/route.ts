import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  // 303 forces the browser to follow the redirect with GET instead of
  // repeating the POST — without it, /login (a page, not an API route)
  // silently fails to render on the follow-up request.
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
