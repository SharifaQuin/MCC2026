import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AccountPage() {
  const session = await getSession();
  const labels = t(session?.language ?? "EN");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-brand-900">{labels.myAccount}</h1>
      <ChangePasswordForm />
    </div>
  );
}
