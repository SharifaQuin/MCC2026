"use client";

import { useState, useTransition } from "react";
import { saveRevenueSnapshotAction } from "./actions";

const COVERAGE_OPTIONS = [
  { value: "FULL_MONTH", label: "Full month" },
  { value: "MONTH_TO_DATE", label: "Month to date" },
];
const STATUS_OPTIONS = [
  { value: "PROVISIONAL", label: "Provisional" },
  { value: "RECONCILED", label: "Reconciled" },
];

export interface RevenueEntryDefaults {
  revenue: string;
  source: string;
  coverage: string;
  coverageThrough: string; // "YYYY-MM-DD"
  sourceAsOf: string; // "YYYY-MM-DDTHH:mm"
  status: string;
}

export default function RevenueEntryForm({
  monthKey,
  defaults,
}: {
  monthKey: string;
  defaults: RevenueEntryDefaults;
}) {
  const [pending, startTransition] = useTransition();
  const [revenue, setRevenue] = useState(defaults.revenue);
  const [source, setSource] = useState(defaults.source);
  const [coverage, setCoverage] = useState(defaults.coverage);
  const [coverageThrough, setCoverageThrough] = useState(defaults.coverageThrough);
  const [sourceAsOf, setSourceAsOf] = useState(defaults.sourceAsOf);
  const [status, setStatus] = useState(defaults.status);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);

  function submit(confirmStale: boolean) {
    const formData = new FormData();
    formData.set("monthKey", monthKey);
    formData.set("revenue", revenue);
    formData.set("source", source);
    formData.set("coverage", coverage);
    formData.set("coverageThrough", coverageThrough);
    formData.set("sourceAsOf", sourceAsOf);
    formData.set("status", status);
    if (confirmStale) formData.set("confirmStaleAsOf", "on");

    startTransition(async () => {
      setSavedMessage(null);
      setErrorMessage(null);
      const result = await saveRevenueSnapshotAction(formData);
      if (!result.ok) {
        if (result.code === "STALE_AS_OF") {
          setStaleWarning(result.error);
        } else {
          setStaleWarning(null);
          setErrorMessage(result.error);
        }
        return;
      }
      setStaleWarning(null);
      setSavedMessage(`Saved Completed cleaning charges for ${monthKey}.`);
    });
  }

  return (
    <form
      action={() => submit(false)}
      className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div>
        <label htmlFor="revenue" className="block text-xs font-medium text-neutral-500">
          Completed cleaning charges
        </label>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-neutral-500">$</span>
          <input
            type="number"
            id="revenue"
            min={0}
            step="0.01"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            placeholder="0"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="source" className="block text-xs font-medium text-neutral-500">
          Source
        </label>
        <input
          type="text"
          id="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. TCS completed jobs export"
          maxLength={200}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label htmlFor="status" className="block text-xs font-medium text-neutral-500">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="coverage" className="block text-xs font-medium text-neutral-500">
          Coverage
        </label>
        <select
          id="coverage"
          value={coverage}
          onChange={(e) => setCoverage(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {COVERAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="coverageThrough" className="block text-xs font-medium text-neutral-500">
          Coverage through
        </label>
        <input
          type="date"
          id="coverageThrough"
          value={coverageThrough}
          onChange={(e) => setCoverageThrough(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label htmlFor="sourceAsOf" className="block text-xs font-medium text-neutral-500">
          Source as of
        </label>
        <input
          type="datetime-local"
          id="sourceAsOf"
          value={sourceAsOf}
          onChange={(e) => setSourceAsOf(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>

      {staleWarning && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2 lg:col-span-3">
          <p>{staleWarning}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(true)}
            className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
          >
            Confirm and save anyway
          </button>
        </div>
      )}

      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save Revenue"}
        </button>
        {savedMessage && !pending && <p className="text-sm font-medium text-green-700">✓ {savedMessage}</p>}
        {errorMessage && !pending && <p className="text-sm font-medium text-red-700">{errorMessage}</p>}
      </div>
    </form>
  );
}
