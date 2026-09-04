import FieldEvaluationEntry from "@/components/FieldEvaluationEntry";

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
  traineeId,
  evaluations,
  categoryAverages,
  focusAreas,
}: {
  traineeId: string;
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
            <FieldEvaluationEntry key={ev.id} evaluation={ev} traineeId={traineeId} />
          ))}
        </div>
      </div>
    </div>
  );
}
