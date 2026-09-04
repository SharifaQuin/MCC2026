import { redirect } from "next/navigation";
import { getSession, clearSessionCookie } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/Nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // The session cookie is a signed JWT that stays valid for 30 days regardless
  // of DB state, so a deactivated account needs an explicit check here to be
  // locked out immediately rather than waiting for the cookie to expire.
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { active: true },
  });
  if (!user || !user.active) {
    clearSessionCookie();
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <Nav session={session} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
