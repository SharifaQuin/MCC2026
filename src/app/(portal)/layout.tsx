import { redirect } from "next/navigation";
import { getSession, clearSessionCookie } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveUserDepartments } from "@/lib/departments";
import { getAllAreaAccessForUser } from "@/lib/officeAssistant";
import { hasTrainingContentEditAccess } from "@/lib/trainingContentAccess";
import { stopActingAs, ROLE_LABELS } from "@/lib/impersonation";
import { getTrainingExperienceVersion } from "@/lib/rookieJourney";
import { buildNavGroups } from "@/lib/navigation";
import Sidebar from "@/components/nav/Sidebar";
import MobileNav from "@/components/nav/MobileNav";
import GoalProgressBar from "@/components/GoalProgressBar";
import ImpersonationBanner from "@/components/ImpersonationBanner";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // The session cookie is a signed JWT that stays valid for 30 days regardless
  // of DB state, so a deactivated account needs an explicit check here to be
  // locked out immediately rather than waiting for the cookie to expire.
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { active: true, departmentAccess: { select: { department: true, canEdit: true } } },
  });
  if (!user || !user.active) {
    // If the account that's gone invalid is one the Owner is acting as
    // (e.g. deactivated mid-session), restore the Owner's own session
    // instead of logging them out entirely.
    if (session.actingAs) {
      const result = await stopActingAs();
      if (result === "restored") redirect("/");
    }
    clearSessionCookie();
    redirect("/login");
  }

  const departments = resolveUserDepartments(session.role, user.departmentAccess);
  // While Rookie Journey is the active training mode, the classic catalog
  // isn't the live curriculum for anyone — hide both of navigation.ts's
  // /modules links (the Trainee one and the Office Assistant one) the same
  // way, declutter-only: neither role's actual Lesson/quiz data, progress,
  // or access changes, only whether this one nav link shows.
  const hideModulesNavLink = (await getTrainingExperienceVersion()) === "rookie";

  const officeAssistantAreas =
    session.role === "OFFICE_ASSISTANT" ? (await getAllAreaAccessForUser(session.sub)).areas : undefined;
  const pendingApprovalCount =
    session.role === "ADMIN" || session.role === "SERVICE_MANAGER"
      ? await prisma.approvalRequest.count({ where: { managerId: session.sub, status: "PENDING" } })
      : 0;
  // Same live-count-on-every-request pattern as pendingApprovalCount above —
  // a fresh submission or a reporter reopening theirs via "Still having
  // trouble" both show up here on the very next navigation, no separate
  // invalidation needed beyond the status write itself.
  const openProblemReportCount =
    session.role === "ADMIN" ? await prisma.problemReport.count({ where: { status: "OPEN" } }) : 0;
  const canEditTrainingContent = await hasTrainingContentEditAccess(session.sub);

  // Trainer/Service Manager-facing screens have no Spanish content, so the
  // language toggle (wherever it now lives — the gear dropdown) stays
  // hidden for them, matching the old header's behavior exactly.
  const showLanguageToggle = session.role !== "TRAINER" && session.role !== "SERVICE_MANAGER";

  const navGroups = buildNavGroups({
    role: session.role,
    language: session.language,
    departments,
    hideModulesLink: hideModulesNavLink,
    officeAssistantAreas,
    pendingApprovalCount,
    openProblemReportCount,
    canEditTrainingContent,
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar
        name={session.name}
        language={session.language}
        showLanguageToggle={showLanguageToggle}
        groups={navGroups}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 print:static">
          <MobileNav
            name={session.name}
            language={session.language}
            showLanguageToggle={showLanguageToggle}
            groups={navGroups}
          />
          {session.actingAs && (
            <ImpersonationBanner
              viewingAsName={session.name}
              viewingAsRoleLabel={ROLE_LABELS[session.role]}
              ownerName={session.actingAs.ownerName}
            />
          )}
          <GoalProgressBar session={session} departments={departments} />
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
