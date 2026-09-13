"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createComplianceDocumentAction,
  updateComplianceDocumentAction,
  deleteComplianceDocumentAction,
  type ComplianceDocState,
} from "@/app/actions/complianceDocs";
import { COMPLIANCE_DOC_TYPE_LABELS, getComplianceDocStatus, complianceDocLabel } from "@/lib/complianceDocs";
import { fileToDataUrl } from "@/lib/fileToDataUrl";
import type { ComplianceDocType } from "@prisma/client";

export interface ComplianceDocRow {
  id: string;
  docType: ComplianceDocType;
  label: string | null;
  expirationDate: string;
  fileDataUrl: string | null;
  fileName: string | null;
  notes: string | null;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function NewComplianceDocForm({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const [docType, setDocType] = useState<ComplianceDocType>("DRIVERS_LICENSE");
  const [fileDataUrl, setFileDataUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const action = createComplianceDocumentAction.bind(null, employeeId);
  const [state, formAction] = useFormState<ComplianceDocState, FormData>(action, {});

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium">Document type</label>
        <select
          name="docType"
          value={docType}
          onChange={(e) => setDocType(e.target.value as ComplianceDocType)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {Object.entries(COMPLIANCE_DOC_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {docType === "OTHER" && (
        <div>
          <label className="mb-1 block text-xs font-medium">Document name</label>
          <input name="label" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium">Expiration date</label>
        <input
          type="date"
          name="expirationDate"
          required
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Upload (optional)</label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            setFileDataUrl(await fileToDataUrl(file));
          }}
          className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <input type="hidden" name="fileDataUrl" value={fileDataUrl} />
        <input type="hidden" name="fileName" value={fileName} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Notes (optional)</label>
        <textarea name="notes" rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Save" />
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditComplianceDocForm({
  employeeId,
  doc,
  onClose,
}: {
  employeeId: string;
  doc: ComplianceDocRow;
  onClose: () => void;
}) {
  const [docType, setDocType] = useState<ComplianceDocType>(doc.docType);
  const action = updateComplianceDocumentAction.bind(null, doc.id, employeeId);
  const [state, formAction] = useFormState<ComplianceDocState, FormData>(action, {});

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium">Document type</label>
        <select
          name="docType"
          value={docType}
          onChange={(e) => setDocType(e.target.value as ComplianceDocType)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {Object.entries(COMPLIANCE_DOC_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {docType === "OTHER" && (
        <div>
          <label className="mb-1 block text-xs font-medium">Document name</label>
          <input
            name="label"
            required
            defaultValue={doc.label ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium">Expiration date</label>
        <input
          type="date"
          name="expirationDate"
          required
          defaultValue={doc.expirationDate.slice(0, 10)}
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Notes (optional)</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={doc.notes ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Save Changes" />
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

const STATUS_STYLES: Record<string, string> = {
  EXPIRED: "bg-red-100 text-red-700",
  EXPIRING_SOON: "bg-amber-100 text-amber-700",
  OK: "bg-green-100 text-green-700",
};
const STATUS_LABELS: Record<string, string> = {
  EXPIRED: "Expired",
  EXPIRING_SOON: "Expiring Soon",
  OK: "Current",
};

function DocRow({
  employeeId,
  doc,
  canManage,
}: {
  employeeId: string;
  doc: ComplianceDocRow;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return <EditComplianceDocForm employeeId={employeeId} doc={doc} onClose={() => setEditing(false)} />;
  }

  const status = getComplianceDocStatus(new Date(doc.expirationDate));

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-900">{complianceDocLabel(doc.docType, doc.label)}</p>
          <p className="text-xs text-neutral-500">Expires {new Date(doc.expirationDate).toLocaleDateString()}</p>
          {doc.notes && <p className="mt-1 text-xs text-neutral-600">{doc.notes}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
          </span>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("Delete this compliance document?")) {
                    startTransition(() => deleteComplianceDocumentAction(doc.id, employeeId));
                  }
                }}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComplianceDocsPanel({
  employeeId,
  documents,
  canManage,
}: {
  employeeId: string;
  documents: ComplianceDocRow[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {canManage && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Add Document
        </button>
      )}
      {open && <NewComplianceDocForm employeeId={employeeId} onClose={() => setOpen(false)} />}

      {documents.length === 0 ? (
        <p className="text-sm text-neutral-500">No compliance documents on file.</p>
      ) : (
        <div className="space-y-3">
          {documents.map((d) => (
            <DocRow key={d.id} employeeId={employeeId} doc={d} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}
