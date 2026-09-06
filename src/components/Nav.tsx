import Link from "next/link";
import type { SessionPayload } from "@/lib/session";
import { t } from "@/lib/i18n";
import { setLanguageAction } from "@/app/actions/language";
import Logo from "@/components/Logo";
import { DEPARTMENT_INFO, type AccessibleDepartment } from "@/lib/departments";

export default function Nav({
  session,
  departments,
}: {
  session: SessionPayload;
  departments: AccessibleDepartment[];
}) {
  const labels = t(session.language);

  const staffOnly = session.role === "TRAINER" || session.role === "SERVICE_MANAGER";

  return (
    <header className="border-b-2 border-gold-500 bg-white print:hidden">
      {departments.length > 1 && (
        <div className="border-b border-neutral-100 bg-neutral-50">
          <div className="mx-auto flex max-w-5xl gap-1 px-4 py-1.5 text-xs">
            {departments.map(({ department }) => (
              <Link
                key={department}
                href={DEPARTMENT_INFO[department].href}
                className="rounded px-2 py-1 font-medium text-neutral-600 hover:bg-white hover:text-brand-700"
              >
                {session.language === "ES"
                  ? DEPARTMENT_INFO[department].labelEs
                  : DEPARTMENT_INFO[department].labelEn}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {!staffOnly && (
              <>
                <Link href="/modules" className="hover:underline">
                  {labels.modules}
                </Link>
                <Link href="/progress" className="hover:underline">
                  {labels.progress}
                </Link>
                <Link href="/glossary" className="hover:underline">
                  {labels.glossary}
                </Link>
              </>
            )}
            {(session.role === "ADMIN" || session.role === "SERVICE_MANAGER") && (
              <>
                <Link href="/admin/employees" className="hover:underline">
                  {labels.employees}
                </Link>
                {session.role === "ADMIN" && (
                  <>
                    <Link href="/admin/content" className="hover:underline">
                      {labels.content}
                    </Link>
                    <Link href="/admin/permissions" className="hover:underline">
                      {labels.permissions}
                    </Link>
                  </>
                )}
                <Link href="/admin/invite" className="hover:underline">
                  {labels.invite}
                </Link>
              </>
            )}
            {session.role === "TRAINER" && (
              <Link href="/trainer/employees" className="hover:underline">
                {labels.employees}
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
