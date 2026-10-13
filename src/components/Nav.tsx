import Link from "next/link";
import type { SessionPayload } from "@/lib/session";
import { t } from "@/lib/i18n";
import { setLanguageAction } from "@/app/actions/language";
import Logo from "@/components/Logo";
import { DEPARTMENT_INFO, type AccessibleDepartment } from "@/lib/departments";
import type { PermissionArea } from "@prisma/client";

interface AreaAccessResult {
  canView: boolean;
  canEdit: boolean;
}

const OFFICE_ASSISTANT_NAV_LINKS: Array<{ area: PermissionArea; href: string; label: string }> = [
  { area: "HR_SUMMARY", href: "/hr", label: "HR Summary" },
  { area: "RECRUITING", href: "/recruiting", label: "Recruiting" },
  { area: "STAFF_DIRECTORY", href: "/staff", label: "Staff" },
  { area: "SALES_LEADS", href: "/sales/leads", label: "Leads" },
  { area: "CALLBACK_QUEUE", href: "/sales/leads", label: "Callbacks" },
  { area: "OPERATIONAL_STATUS", href: "/operations", label: "Operations" },
  { area: "ASSIGNED_TASKS", href: "/todo", label: "To-Do" },
];

export default function Nav({
  session,
  departments,
  hideModulesLink,
  officeAssistantAreas,
  pendingApprovalCount,
}: {
  session: SessionPayload;
  departments: AccessibleDepartment[];
  hideModulesLink?: boolean;
  officeAssistantAreas?: Partial<Record<PermissionArea, AreaAccessResult>>;
  pendingApprovalCount?: number;
}) {
  const labels = t(session.language);

  const staffOnly = session.role === "TRAINER" || session.role === "SERVICE_MANAGER";
  const canDecideApprovals = session.role === "ADMIN" || session.role === "SERVICE_MANAGER";
  // De-duplicate hrefs (Leads/Callbacks both point at /sales/leads today)
  // while still gating each on its own area grant.
  const officeAssistantLinks = officeAssistantAreas
    ? OFFICE_ASSISTANT_NAV_LINKS.filter((link) => officeAssistantAreas[link.area]?.canView).filter(
        (link, i, arr) => arr.findIndex((l) => l.href === link.href) === i
      )
    : [];

  return (
    <header className="border-b-2 border-gold-500 bg-white print:hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Link href="/">
            <Logo />
          </Link>
          {departments.length > 1 && (
            <div className="flex flex-wrap gap-1 text-xs">
              {departments.map(({ department }) => (
                <Link
                  key={department}
                  href={DEPARTMENT_INFO[department].href}
                  className="rounded bg-neutral-50 px-2 py-1 font-medium text-neutral-600 hover:bg-neutral-100 hover:text-brand-700"
                >
                  {session.language === "ES"
                    ? DEPARTMENT_INFO[department].labelEs
                    : DEPARTMENT_INFO[department].labelEn}
                </Link>
              ))}
            </div>
          )}
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {session.role === "TRAINEE" && (
              <>
                <Link href="/documents" className="hover:underline">
                  {labels.documents}
                </Link>
                {!hideModulesLink && (
                  <Link href="/modules" className="hover:underline">
                    {labels.modules}
                  </Link>
                )}
                <Link href="/progress" className="hover:underline">
                  {labels.progress}
                </Link>
                <Link href="/glossary" className="hover:underline">
                  {labels.glossary}
                </Link>
                <Link href="/payroll" className="hover:underline">
                  {labels.payroll}
                </Link>
              </>
            )}
            {session.role === "TRAINER" && (
              <>
                <Link href="/trainer/employees" className="hover:underline">
                  {labels.employees}
                </Link>
                <Link href="/payroll" className="hover:underline">
                  {labels.payroll}
                </Link>
              </>
            )}
            {session.role === "ADMIN" && (
              <>
                <Link href="/admin/rookie-journey" className="hover:underline">
                  Rookie Journey
                </Link>
                <Link href="/financials" className="hover:underline">
                  {labels.financials}
                </Link>
                <Link href="/assistant" className="hover:underline">
                  {labels.assistant}
                </Link>
                <Link href="/todo" className="hover:underline">
                  {labels.todo}
                </Link>
                <Link href="/test-accounts" className="hover:underline">
                  {labels.testAccounts}
                </Link>
              </>
            )}
            {session.role === "OFFICE_ASSISTANT" &&
              officeAssistantLinks.map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              ))}
            {canDecideApprovals && (
              <Link href="/recruiting/approvals" className="hover:underline">
                Pending Approvals
                {!!pendingApprovalCount && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {pendingApprovalCount}
                  </span>
                )}
              </Link>
            )}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-neutral-500">{session.name}</span>
          <Link href="/account" className="hover:underline">
            {labels.myAccount}
          </Link>
          {!staffOnly && (
            <div className="flex gap-1">
              <form action={setLanguageAction.bind(null, "EN")}>
                <button
                  className={`rounded px-2 py-1 ${
                    session.language === "EN" ? "bg-brand-600 text-white" : "bg-neutral-100"
                  }`}
                >
                  EN
                </button>
              </form>
              <form action={setLanguageAction.bind(null, "ES")}>
                <button
                  className={`rounded px-2 py-1 ${
                    session.language === "ES" ? "bg-brand-600 text-white" : "bg-neutral-100"
                  }`}
                >
                  ES
                </button>
              </form>
            </div>
          )}
          <form action="/logout" method="POST">
            <button className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100">
              {labels.logout}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
