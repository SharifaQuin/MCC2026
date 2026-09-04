import { findCategory } from "@/lib/fieldEval";

interface CategoryAvg {
  key: string;
  label: string;
  relatedModuleTitles: string[];
  average: number | null;
  entryCount: number;
}

interface EvalCategory {
  categoryKey: string;
  score: number;
  checkedItems: string[];
  notes: string | null;
}

interface EvalEntry {
  id: string;
  fieldDate: Date;
  gradedByName: string;
  generalNotes: string | null;
  overallScore: number | null;
  categories: EvalCategory[];
}

export default function FieldEvaluationHistory({
  evaluations,
  categoryAverages,
  focusAreas,
}: {
  evaluations: EvalEntry[];
  categoryAverages: CategoryAvg[];
  focusAreas: CategoryAvg[];
}) {
  if (evaluations.length === 0) {
    return <p className="text-sm text-neutral-500">No field day evaluations logged yet.</p>;
  }

  return (
    <div className="space-y-6">
      {focusAreas.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-medium text-amber-800">
            Suggested focus areas (average score below 3/5)
          </p>
          <ul className="space-y-1 text-sm text-amber-800">
            {focusAreas.map((f) => (
              <li key={f.key}>
                <span className="font-medium">{f.label}</span> — avg {f.average}/5. Review:{" "}
                {f.relatedModuleTitles.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-neutral-500">Category averages</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categoryAverages.map((c) => (
            <div key={c.key} className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs text-neutral-500">{c.label}</p>
              <p className="text-lg font-semibold">
                {c.average !== null ? `${c.average}/5` : "—"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-neutral-500">Field day history</p>
        <div className="space-y-3">
          {evaluations.map((ev) => (
            <div key={ev.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">
                  {new Date(ev.fieldDate).toLocaleDateString()} — Overall: {ev.overallScore}/5
                </p>
                <p className="text-xs text-neutral-400">Graded by {ev.gradedByName}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {ev.categories.map((c) => {
                  const def = findCategory(c.categoryKey);
                  return (
                    <div key={c.categoryKey} className="rounded-md bg-neutral-50 p-2 text-sm">
                      <p className="font-medium">
                        {def?.label ?? c.categoryKey}: {c.score}/5
                      </p>
                      {c.checkedItems.length > 0 && (
                        <ul className="ml-4 list-disc text-xs text-neutral-600">
                          {c.checkedItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                      {c.notes && <p className="mt-1 text-xs italic text-neutral-500">{c.notes}</p>}
                    </div>
                  );
                })}
              </div>
              {ev.generalNotes && (
                <p className="mt-2 text-sm italic text-neutral-600">{ev.generalNotes}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
