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
  "/apply",
  "/careers",
  "/lead-form",
  "/interview-confirm",
  "/interview-book",
  "/interview-reschedule",
  "/legal",
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
    (pathname.startsWith("/admin/content") ||
      pathname.startsWith("/admin/permissions") ||
      pathname.startsWith("/admin/documents") ||
      pathname.startsWith("/admin/rookie-journey") ||
      // "My owner dashboard" — deliberately ADMIN-only, not Service Manager
      // too, since a report might be about a Service Manager.
      pathname.startsWith("/owner/problem-reports") ||
      pathname.startsWith("/staff/document-templates") ||
      pathname.startsWith("/financials") ||
      pathname.startsWith("/assistant") ||
      pathname.startsWith("/test-accounts") ||
      pathname.startsWith("/api/quickbooks")) &&
    payload.role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Any authenticated role can reach /todo — a task can now be assigned to
  // anyone (Trainee/Trainer/Service Manager/Office Assistant), and the page
  // itself (src/app/(portal)/todo/page.tsx) scopes what each viewer actually
  // sees/can edit; this gate only decides who gets past the door, same as
  // e.g. /modules having no role gate at all.

  if (
    pathname.startsWith("/admin") &&
    payload.role !== "ADMIN" &&
    payload.role !== "SERVICE_MANAGER"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Recruiting: Office Assistant and (narrower still) a Sales Rep
  // individually granted the RECRUITING area are both admitted here too,
  // with much narrower access than Service Manager —
  // requireRecruitingAccess (src/lib/requireRecruitingAccess.ts) and this
  // section's own per-action checks decide what either can actually see/do
  // once past this gate; a Sales Rep with no such grant is redirected
  // there, not here, same as an Office Assistant with no grant already is.
  if (
    pathname.startsWith("/recruiting") &&
    payload.role !== "ADMIN" &&
    payload.role !== "SERVICE_MANAGER" &&
    payload.role !== "OFFICE_ASSISTANT" &&
    payload.role !== "SALES_REP"
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Staff: deliberately NOT extended to Sales Rep — this role has no
  // grantable path to Staff Directory at all (see SALES_REP_GRANTABLE_AREAS
  // in src/lib/permissionAreas.ts), so it stays closed at this earliest
  // gate rather than relying solely on the page-level check.
  if (
    pathname.startsWith("/staff") &&
    payload.role !== "ADMIN" &&
    payload.role !== "SERVICE_MANAGER" &&
    payload.role !== "OFFICE_ASSISTANT"
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
