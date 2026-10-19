import type { PermissionArea } from "@prisma/client";
import type { Role, Language } from "@/lib/session";
import { t } from "@/lib/i18n";
import { DEPARTMENT_INFO, type AccessibleDepartment } from "@/lib/departments";

interface AreaAccessResult {
  canView: boolean;
  canEdit: boolean;
}

export interface NavLinkItem {
  href: string;
  label: string;
  badge?: number;
}

export interface NavGroup {
  key: string;
  label: string;
  links: NavLinkItem[];
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

// The single source of truth for "what links does this person see" — used
// by both the desktop sidebar and the mobile drawer so they can never drift
// apart, and by getPageTitle() below for the mobile top bar's page name.
// Every link here existed in the old top Nav already; this only reorganizes
// them into labelled groups and hides any group that ends up empty — it
// never grants anyone a link their role/area access didn't already allow.
export function buildNavGroups({
  role,
  language,
  departments,
  hideModulesLink,
  officeAssistantAreas,
  pendingApprovalCount,
}: {
  role: Role;
  language: Language;
  departments: AccessibleDepartment[];
  hideModulesLink?: boolean;
  officeAssistantAreas?: Partial<Record<PermissionArea, AreaAccessResult>>;
  pendingApprovalCount?: number;
}): NavGroup[] {
  const labels = t(language);
  const groups: NavGroup[] = [];

  if (departments.length > 1) {
    groups.push({
      key: "departments",
      label: labels.navDepartments,
      links: departments.map(({ department }) => ({
        href: DEPARTMENT_INFO[department].href,
        label: language === "ES" ? DEPARTMENT_INFO[department].labelEs : DEPARTMENT_INFO[department].labelEn,
      })),
    });
  }

  if (role === "TRAINEE") {
    const trainingLinks: NavLinkItem[] = [];
    if (!hideModulesLink) trainingLinks.push({ href: "/modules", label: labels.modules });
    trainingLinks.push({ href: "/progress", label: labels.progress }, { href: "/glossary", label: labels.glossary });
    if (trainingLinks.length > 0) {
      groups.push({ key: "training", label: labels.navMyTraining, links: trainingLinks });
    }
    groups.push({
      key: "pay-documents",
      label: labels.navMyPayDocuments,
      links: [
        { href: "/documents", label: labels.documents },
        { href: "/payroll", label: labels.payroll },
      ],
    });
  }

  if (role === "TRAINER") {
    groups.push({
      key: "team",
      label: labels.navMyTeam,
      links: [
        { href: "/trainer/employees", label: labels.employees },
        { href: "/payroll", label: labels.payroll },
      ],
    });
  }

  if (role === "ADMIN") {
    groups.push({
      key: "business-tools",
      label: labels.navBusinessTools,
      links: [
        { href: "/financials", label: labels.financials },
        { href: "/assistant", label: labels.assistant },
        { href: "/todo", label: labels.todo },
        { href: "/admin/rookie-journey", label: "Rookie Journey" },
        { href: "/owner/problem-reports", label: "Problem Reports" },
        { href: "/test-accounts", label: labels.testAccounts },
      ],
    });
  }

  // An Office Assistant can also be an active technician going through the
  // same module/quiz/glossary content as a Trainee — their Training area
  // grant (set on the Permissions screen, independent of every other area)
  // is what decides whether they see this group at all, same as every other
  // Office Assistant nav link below. No other role is affected: Trainees
  // already get their own "My Training" group above, and every other role
  // either has no need for it or reaches it a different way.
  if (role === "OFFICE_ASSISTANT" && officeAssistantAreas?.TRAINING?.canView) {
    groups.push({
      key: "training",
      label: labels.navMyTraining,
      links: [
        { href: "/modules", label: labels.training },
        { href: "/progress", label: labels.progress },
        { href: "/glossary", label: labels.glossary },
      ],
    });
  }

  if (role === "OFFICE_ASSISTANT" && officeAssistantAreas) {
    const links = OFFICE_ASSISTANT_NAV_LINKS.filter((link) => officeAssistantAreas[link.area]?.canView).filter(
      (link, i, arr) => arr.findIndex((l) => l.href === link.href) === i
    );
    if (links.length > 0) {
      groups.push({ key: "work-areas", label: labels.navYourWorkAreas, links });
    }
  }

  const canDecideApprovals = role === "ADMIN" || role === "SERVICE_MANAGER";
  if (canDecideApprovals) {
    groups.push({
      key: "management",
      label: labels.navManagement,
      links: [
        {
          href: "/recruiting/approvals",
          label: labels.pendingApprovals,
          badge: pendingApprovalCount,
        },
      ],
    });
  }

  return groups;
}

// A route a page's active-link highlighting and the mobile top bar's
// current-page name can both use. Nav groups cover most routes already;
// this adds a few top-level pages that exist but never appear in the nav
// itself (Home, account, help, report-a-problem, and section roots reached
// by drilling into a record rather than a nav click).
const FALLBACK_PAGE_TITLES: Array<{ prefix: string; label: (language: Language) => string }> = [
  { prefix: "/account", label: (l) => t(l).myAccount },
  { prefix: "/help", label: () => "Help" },
  { prefix: "/report-a-problem", label: () => "Report a Problem" },
  { prefix: "/owner/problem-reports", label: () => "Problem Reports" },
  { prefix: "/admin", label: (l) => t(l).admin },
  { prefix: "/staff", label: () => "Staff" },
  { prefix: "/recruiting", label: (l) => t(l).recruiting },
  { prefix: "/sales", label: () => "Sales" },
  { prefix: "/hr", label: () => "HR" },
  { prefix: "/operations", label: () => "Operations" },
  { prefix: "/management", label: () => "Management" },
  { prefix: "/trainer", label: () => "Team" },
];

export function getPageTitle(pathname: string, groups: NavGroup[], language: Language): string {
  if (pathname === "/") return t(language).dashboard;

  const allLinks = groups.flatMap((g) => g.links);
  const bestLinkMatch = allLinks
    .filter((link) => pathname === link.href || pathname.startsWith(link.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (bestLinkMatch) return bestLinkMatch.label;

  const bestFallback = FALLBACK_PAGE_TITLES.filter(
    (f) => pathname === f.prefix || pathname.startsWith(f.prefix + "/")
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (bestFallback) return bestFallback.label(language);

  return t(language).appName;
}
