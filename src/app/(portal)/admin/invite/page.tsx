import InviteForm from "./InviteForm";
import BulkInviteForm from "./BulkInviteForm";

export default function AdminInvitePage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Invite Employee</h1>
        <InviteForm />
      </div>

      <div className="border-t border-neutral-200 pt-8">
        <h2 className="mb-2 text-lg font-semibold">Bulk Invite via CSV</h2>
        <p className="mb-6 text-sm text-neutral-500">
          Invite multiple employees at once by uploading a CSV file.
        </p>
        <BulkInviteForm />
      </div>
    </div>
  );
}
