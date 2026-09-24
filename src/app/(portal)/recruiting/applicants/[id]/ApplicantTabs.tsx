"use client";

import { useState } from "react";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export default function ApplicantTabs({ tabs, initialTab }: { tabs: Tab[]; initialTab?: string }) {
  const [active, setActive] = useState(
    initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : tabs[0]?.id ?? ""
  );

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active === tab.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} hidden={active !== tab.id}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
