import { stopViewingAsAction } from "@/app/(portal)/test-accounts/actions";

export default function ImpersonationBanner({
  viewingAsName,
  viewingAsRoleLabel,
  ownerName,
}: {
  viewingAsName: string;
  viewingAsRoleLabel: string;
  ownerName: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950 print:hidden">
      <span>
        {ownerName}, you're viewing as <strong>{viewingAsName}</strong> ({viewingAsRoleLabel}) — Test
        Account
      </span>
      <form action={stopViewingAsAction}>
        <button className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900">
          Return to Owner View
        </button>
      </form>
    </div>
  );
}
