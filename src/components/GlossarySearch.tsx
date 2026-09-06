"use client";

import { useMemo, useState } from "react";
import { GLOSSARY } from "@/lib/glossary";
import type { Language } from "@/lib/session";

export default function GlossarySearch({
  language,
  placeholder,
}: {
  language: Language;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GLOSSARY;
    return GLOSSARY.filter((entry) => {
      const def = language === "ES" ? entry.definitionEs : entry.definitionEn;
      return entry.term.toLowerCase().includes(q) || def.toLowerCase().includes(q);
    });
  }, [query, language]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="mb-6 w-full rounded-md border border-neutral-300 px-4 py-2 text-sm"
      />
      <div className="space-y-3">
        {filtered.map((entry) => (
          <div key={entry.term} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="font-medium text-brand-700">{entry.term}</p>
            <p className="mt-1 text-sm text-neutral-700">
              {language === "ES" ? entry.definitionEs : entry.definitionEn}
            </p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-neutral-500">
            {language === "ES" ? "No se encontraron términos." : "No terms found."}
          </p>
        )}
      </div>
    </div>
  );
}
