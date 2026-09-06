import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import GlossarySearch from "@/components/GlossarySearch";

export default async function GlossaryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const labels = t(session.language);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{labels.glossary}</h1>
      <p className="mb-6 text-sm text-neutral-500">{labels.glossarySubtitle}</p>
      <GlossarySearch
        language={session.language}
        placeholder={session.language === "ES" ? "Buscar un término..." : "Search a term..."}
      />
    </div>
  );
}
