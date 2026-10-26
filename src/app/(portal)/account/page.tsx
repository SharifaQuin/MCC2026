import Link from "next/link";
import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getActingAsCandidates, ROLE_LABELS as ACTING_AS_ROLE_LABELS } from "@/lib/impersonation";
import { actAsStaffMemberAction } from "../staff/actingAsActions";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AccountPage() {
  const session = await getSession();
  const labels = t(session?.language ?? "EN");
  // Mirrors staff/page.tsx's exact invariant: a currently-acting-as session
  // always carries the target's role (startActingAs refuses to ever target
  // another ADMIN), so this alone also excludes an impersonated session —
  // no separate !session.actingAs check is needed, matching the original.
  const isAdmin = session?.role === "ADMIN";
  const actingAsCandidates = isAdmin ? await getActingAsCandidates() : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-brand-900">{labels.myAccount}</h1>
      {session?.actingAs ? (
        <div className="max-w-sm rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Changing a password is unavailable while viewing and acting as another user.
        </div>
      ) : (
        <ChangePasswordForm />
      )}

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
