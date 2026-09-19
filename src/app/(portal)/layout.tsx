import { redirect } from "next/navigation";
import { getSession, clearSessionCookie } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveUserDepartments } from "@/lib/departments";
import { getImpersonationState, ROLE_LABELS } from "@/lib/impersonation";
import Nav from "@/components/Nav";
import GoalProgressBar from "@/components/GoalProgressBar";
import ImpersonationBanner from "@/components/ImpersonationBanner";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const impersonation = await getImpersonationState();

  // The session cookie is a signed JWT that stays valid for 30 days regardless
  // of DB state, so a deactivated account needs an explicit check here to be
  // locked out immediately rather than waiting for the cookie to expire.
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { active: true, departmentAccess: { select: { department: true, canEdit: true } } },
  });
  if (!user || !user.active) {
    clearSessionCookie();
    redirect("/login");
  }

  const departments = resolveUserDepartments(session.role, user.departmentAccess);

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-20 print:static">
        {impersonation.isImpersonating && (
          <ImpersonationBanner
            viewingAsName={session.name}
            viewingAsRoleLabel={ROLE_LABELS[session.role]}
            ownerName={impersonation.ownerName ?? "Owner"}
          />
        )}
        <Nav session={session} departments={departments} />
        <GoalProgressBar session={session} departments={departments} />
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
