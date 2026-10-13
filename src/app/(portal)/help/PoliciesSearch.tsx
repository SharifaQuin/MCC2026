"use client";

import { useState } from "react";
import type { PolicyDocumentRow } from "@/lib/policies";

export default function PoliciesSearch({
  policies,
  labels,
}: {
  policies: PolicyDocumentRow[];
  labels: { searchPlaceholder: string; emptyNone: string; emptySearch: string };
}) {
  const [query, setQuery] = useState("");
  const filtered = policies.filter((p) => p.filename.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={labels.searchPlaceholder}
        aria-label={labels.searchPlaceholder}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <div className="mt-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-neutral-400">{policies.length === 0 ? labels.emptyNone : labels.emptySearch}</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
            {filtered.map((p) => (
              <li key={p.id} className="px-3 py-2 text-sm text-neutral-800">
                {p.title}
                <span className="ml-2 text-xs text-neutral-400">{p.filename}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
