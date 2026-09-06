import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getModuleListForUser } from "@/lib/courses";
import { t } from "@/lib/i18n";

const statusStyles: Record<string, string> = {
  NOT_STARTED: "bg-neutral-100 text-neutral-600",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
};

export default async function ModulesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const labels = t(session.language);
  const modules = await getModuleListForUser(session.sub);
  const nextModule = modules.find((m) => !m.locked && m.status !== "COMPLETED");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{labels.modules}</h1>
        {nextModule && (
          <Link
            href={`/modules/${nextModule.slug}`}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {labels.continueTraining}
          </Link>
        )}
      </div>
      <ol className="space-y-3">
        {modules.map((m) => {
          const title = session.language === "ES" && m.titleEs ? m.titleEs : m.titleEn;
          const summary = session.language === "ES" && m.summaryEs ? m.summaryEs : m.summaryEn;
          const statusLabel =
            m.status === "COMPLETED"
              ? labels.completed
              : m.status === "IN_PROGRESS"
                ? labels.inProgress
                : labels.notStarted;

          return (
            <li
              key={m.id}
              className={`rounded-lg border border-neutral-200 bg-white p-4 ${
                m.locked ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Module {m.order}
                  </p>
                  {m.locked ? (
                    <span className="text-lg font-medium text-neutral-500">{title}</span>
                  ) : (
                    <Link
                      href={`/modules/${m.slug}`}
                      className="text-lg font-medium text-brand-700 hover:underline"
                    >
                      {title}
                    </Link>
                  )}
                  {summary && <p className="mt-1 text-sm text-neutral-500">{summary}</p>}
                  {m.locked && <p className="mt-1 text-xs text-neutral-400">{labels.locked}</p>}
                </div>
                <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${statusStyles[m.status]}`}>
                  {statusLabel}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
