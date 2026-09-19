import { prisma } from "@/lib/prisma";
import { getPendingOnboardingCount } from "@/lib/onboarding";
import { ROLE_LABELS } from "@/lib/impersonation";
import { viewAsAction } from "./actions";

export default async function TestAccountsPage() {
  const accounts = await prisma.user.findMany({
    where: { isTestAccount: true },
    orderBy: { createdAt: "asc" },
  });

  const pendingByAccount = new Map<string, number>();
  for (const account of accounts) {
    if (account.role === "TRAINEE") {
      pendingByAccount.set(account.id, await getPendingOnboardingCount(account.id));
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Test Accounts</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Owner-only. Use "View As" to see the app exactly as one of these roles would — the nav,
        home page, and every gate behave as if you were logged in as that account. A banner stays
        on screen the whole time with a one-click way back to your own owner view. These accounts
        never appear in Staff, payroll, exports, or any other real-employee report.
      </p>

      <div className="space-y-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div>
              <p className="font-medium text-neutral-900">{account.name}</p>
              <p className="text-sm text-neutral-500">{ROLE_LABELS[account.role]}</p>
              {account.role === "TRAINEE" && (
                <p className="mt-1 text-xs text-neutral-400">
                  {(pendingByAccount.get(account.id) ?? 0) > 0
                    ? `${pendingByAccount.get(account.id)} onboarding document(s) pending — you'll see the new-hire documents gate`
                    : "No onboarding documents pending"}
                </p>
              )}
            </div>
            <form action={viewAsAction.bind(null, account.id)}>
              <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                View As
              </button>
            </form>
          </div>
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-neutral-500">
            No test accounts seeded yet. Run the seed script to create them.
          </p>
        )}
      </div>
    </div>
  );
}
