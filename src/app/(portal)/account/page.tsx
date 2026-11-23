import Link from "next/link";
import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getActingAsCandidates, ROLE_LABELS as ACTING_AS_ROLE_LABELS } from "@/lib/impersonation";
import { actAsStaffMemberAction } from "../staff/actingAsActions";
import { setLanguageAction } from "@/app/actions/language";
import ChangePasswordForm from "./ChangePasswordForm";
import { KeyIcon, GlobeIcon, BookIcon, FlagIcon, SignOutIcon, ChevronRightIcon } from "@/components/icons";

// A settings row styled to match the mockup's consolidated Profile screen
// (Change password / Language / Help & Policies / Report a Problem / Sign
// out, one list) — every row here reuses the exact same link or action the
// gear-dropdown menu (SettingsGear.tsx) already offers; nothing new.
function SettingsRow({
  icon,
  children,
  href,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  href?: string;
  danger?: boolean;
}) {
  const content = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-700"}`}>
        {icon}
      </span>
      <span className={`flex-1 text-sm font-medium ${danger ? "text-red-600" : "text-neutral-800"}`}>{children}</span>
      {href && <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300" />}
    </>
  );
  const rowClass = "flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-brand-200";
  if (href) {
    return (
      <Link href={href} className={rowClass}>
        {content}
      </Link>
    );
  }
  return <div className={rowClass}>{content}</div>;
}

export default async function AccountPage() {
  const session = await getSession();
  const labels = t(session?.language ?? "EN");
  // Mirrors staff/page.tsx's exact invariant: a currently-acting-as session
  // always carries the target's role (startActingAs refuses to ever target
  // another ADMIN), so this alone also excludes an impersonated session —
  // no separate !session.actingAs check is needed, matching the original.
  const isAdmin = session?.role === "ADMIN";
  const actingAsCandidates = isAdmin ? await getActingAsCandidates() : [];
  // Mirrors layout.tsx's identical check exactly — Trainer/Service Manager
  // screens have no Spanish content, so the toggle stays hidden here too.
  const showLanguageToggle = session?.role !== "TRAINER" && session?.role !== "SERVICE_MANAGER";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-brand-900">{labels.myAccount}</h1>

      <div className="space-y-2">
        {session?.actingAs ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Changing a password is unavailable while viewing and acting as another user.
          </div>
        ) : (
          <details className="group rounded-xl border border-neutral-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <KeyIcon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-medium text-neutral-800">Change Password</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-neutral-100 px-4 py-4">
              <ChangePasswordForm />
            </div>
          </details>
        )}

        {showLanguageToggle && (
          <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <GlobeIcon className="h-4 w-4" />
            </span>
            <span className="flex-1 text-sm font-medium text-neutral-800">Language: EN / ES</span>
            <div className="flex gap-1">
              <form action={setLanguageAction.bind(null, "EN")}>
                <button
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    session?.language === "EN" ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  EN
                </button>
              </form>
              <form action={setLanguageAction.bind(null, "ES")}>
                <button
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    session?.language === "ES" ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  ES
                </button>
              </form>
            </div>
          </div>
        )}

        <SettingsRow icon={<BookIcon className="h-4 w-4" />} href="/help">
          {labels.navHelpPolicies}
        </SettingsRow>

        <SettingsRow icon={<FlagIcon className="h-4 w-4" />} href="/report-a-problem">
          {labels.navReportProblem}
        </SettingsRow>

        <form action="/logout" method="POST">
          <button type="submit" className="w-full text-left">
            <SettingsRow icon={<SignOutIcon className="h-4 w-4" />} danger>
              {labels.logout}
            </SettingsRow>
          </button>
        </form>
      </div>

      {isAdmin && (
        <div className="space-y-4 border-t border-neutral-200 pt-6">
          <div>
            <h2 className="text-lg font-medium text-neutral-900">{labels.accountOwnerToolsTitle}</h2>
            <p className="text-sm text-neutral-500">{labels.accountOwnerToolsSubtitle}</p>
          </div>

          <Link
            href="/admin/content"
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
          >
            <div>
              <p className="font-medium text-neutral-900">{labels.accountLegacyTraining}</p>
              <p className="text-xs text-neutral-500">{labels.accountLegacyTrainingSubtitle}</p>
            </div>
          </Link>

          <Link
            href="/test-accounts"
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
          >
            <div>
              <p className="font-medium text-neutral-900">{labels.testAccounts}</p>
              <p className="text-xs text-neutral-500">{labels.accountTestAccountsSubtitle}</p>
            </div>
          </Link>

          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="mb-1 text-lg font-medium">{labels.accountActAs}</h3>
            <p className="mb-4 text-sm text-neutral-500">{labels.accountActAsSubtitle}</p>
            <div className="space-y-2">
              {actingAsCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  data-testid={`act-as-row-${candidate.id}`}
                  className="flex items-center justify-between rounded-md border border-neutral-100 bg-neutral-50 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{candidate.name}</p>
                    <p className="text-xs text-neutral-500">
                      {ACTING_AS_ROLE_LABELS[candidate.role]} · {candidate.email}
                    </p>
                  </div>
                  <form action={actAsStaffMemberAction.bind(null, candidate.id)}>
                    <button className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                      {labels.accountActAs}
                    </button>
                  </form>
                </div>
              ))}
              {actingAsCandidates.length === 0 && (
                <p className="text-sm text-neutral-500">{labels.accountActAsNoCandidates}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
