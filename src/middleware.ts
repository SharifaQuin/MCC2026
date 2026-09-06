import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/lib/session";

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

// Static assets a browser/OS may request without a session cookie present —
// e.g. the tab favicon on /login itself, or "Add to Home Screen" fetching
// the manifest/icons before anyone has logged in.
const PUBLIC_PATHS = [
  "/login",
  "/invite",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon.png",
  "/icons",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let payload: { role?: string } | null = null;
  if (token) {
    try {
      const result = await jwtVerify(token, getSecret());
      payload = result.payload as { role?: string };
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    (pathname.startsWith("/admin/content") || pathname.startsWith("/admin/permissions")) &&
    payload.role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (
    pathname.startsWith("/admin") &&
    payload.role !== "ADMIN" &&
    payload.role !== "SERVICE_MANAGER"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (
    pathname.startsWith("/trainer") &&
    payload.role !== "TRAINER" &&
    payload.role !== "SERVICE_MANAGER" &&
    payload.role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
