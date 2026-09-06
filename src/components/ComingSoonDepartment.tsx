export default function ComingSoonDepartment({
  title,
  canEdit,
}: {
  title: string;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
        <p className="font-medium text-neutral-700">Coming soon</p>
        <p className="mt-1 text-sm text-neutral-500">
          This department hasn&apos;t been built out yet — check back in a future update.
        </p>
        <p className="mt-3 text-xs text-neutral-400">
          Your access here: {canEdit ? "Edit" : "View only"}
        </p>
      </div>
    </div>
  );
}
