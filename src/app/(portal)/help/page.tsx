import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getPoliciesForRole } from "@/lib/policies";
import PoliciesSearch from "./PoliciesSearch";

// Deliberately separate from /documents (personal onboarding paperwork a
// trainee signs for themselves) — this is the shared reference library
// (policies/SOPs), reachable by every logged-in role, but each document is
// only visible to the roles it's explicitly opened to. It's an honest empty
// shell today: the owner hasn't chosen or added any files yet.
export default async function HelpPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const labels = t(session.language);
  const policies = await getPoliciesForRole(session.role);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{labels.policiesTitle}</h1>
        <p className="mt-1 text-sm text-neutral-500">{labels.policiesSubtitle}</p>
      </div>

      <PoliciesSearch
        policies={policies}
        labels={{
          searchPlaceholder: labels.policiesSearchPlaceholder,
          emptyNone: labels.policiesEmptyNone,
          emptySearch: labels.policiesEmptySearch,
        }}
      />
    </div>
  );
}
