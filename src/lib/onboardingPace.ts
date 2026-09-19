// Shared by the admin employee list (EmployeeListView) and the trainee's
// own home page — the "Day X of 3" new-hire onboarding-pace read applies
// the same way whether an admin is looking at someone else or a trainee is
// looking at their own status.
export function getOnboardingPace(input: {
  createdAt: Date;
  active: boolean;
  mustSetPassword: boolean;
  certified: boolean;
}): { day: number; overdue: boolean } | null {
  if (!input.active || input.mustSetPassword || input.certified) return null;
  const day = Math.floor((Date.now() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return { day, overdue: day > 3 };
}
