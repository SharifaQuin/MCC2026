import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AccountPage() {
  const session = await getSession();
  const labels = t(session?.language ?? "EN");

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
    </div>
  );
}
