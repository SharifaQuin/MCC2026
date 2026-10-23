import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import ReportProblemForm from "./ReportProblemForm";

// Open to every logged-in role — anyone should be able to flag a problem.
// Submissions are auto-stamped (name/role/date) server-side in
// submitProblemReport and land in a queue only the Owner can read
// (src/app/(portal)/owner/problem-reports) — no email, no third-party
// support desk.
export default async function ReportAProblemPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const labels = t(session.language);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{labels.reportProblemTitle}</h1>
        <p className="mt-1 text-sm text-neutral-500">{labels.reportProblemSubtitle}</p>
      </div>
      <ReportProblemForm language={session.language} />
      <Link href="/my-reports" className="inline-block text-sm text-brand-700 hover:underline">
        {labels.reportProblemViewMyReports}
      </Link>
    </div>
  );
}
