// Pure helpers with no server-only imports (no prisma, no next/headers) so
// they're safe to use from client components as well as server ones.

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  every_60_days: "Every 60 days",
};

function addPeriods(from: Date, frequency: string, periods: number): Date | null {
  const date = new Date(from);
  switch (frequency) {
    case "daily":
      date.setDate(date.getDate() + periods);
      return date;
    case "weekly":
      date.setDate(date.getDate() + periods * 7);
      return date;
    case "monthly":
      date.setMonth(date.getMonth() + periods);
      return date;
    case "every_60_days":
      date.setDate(date.getDate() + periods * 60);
      return date;
    default:
      return null;
  }
}

export interface LoanPayoffEstimate {
  periodsRemaining: number;
  expectedPayoffDate: Date;
}

// Estimates when a loan will be paid off, assuming it keeps paying at least
// its minimumPayment every minimumPaymentFrequency period starting today.
// For loans repaid via a % holdback of daily sales (most of these are MCAs),
// the minimum is only a contractual floor — the real payoff is usually
// sooner than this estimate, never later, so treat it as a worst case.
export function estimateLoanPayoff(
  loan: { currentBalance: number | null; minimumPayment: number | null; minimumPaymentFrequency: string | null },
  from: Date = new Date()
): LoanPayoffEstimate | null {
  if (loan.currentBalance === null || loan.currentBalance <= 0) {
    return { periodsRemaining: 0, expectedPayoffDate: from };
  }
  if (!loan.minimumPayment || loan.minimumPayment <= 0 || !loan.minimumPaymentFrequency) {
    return null;
  }

  const periods = Math.ceil(loan.currentBalance / loan.minimumPayment);
  const expectedPayoffDate = addPeriods(from, loan.minimumPaymentFrequency, periods);
  if (!expectedPayoffDate) return null;

  return { periodsRemaining: periods, expectedPayoffDate };
}
