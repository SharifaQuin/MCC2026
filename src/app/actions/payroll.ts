"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  importPayrollCsv,
  importPayrollExcel,
  getPayrollEntryForSigning,
  getPayrollEntryForOverride,
  attachUnmatchedPayrollReport,
  dismissUnmatchedPayrollReport,
} from "@/lib/payroll";
import { renderPayrollEntryPdf } from "@/lib/payrollPdf";
import { sendEmail } from "@/lib/email";

async function requireHrAccess() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
  return session;
}

export interface PayPeriodState {
  error?: string;
}

export async function createPayPeriodAction(
  _prevState: PayPeriodState,
  formData: FormData
): Promise<PayPeriodState> {
  try {
    await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const label = String(formData.get("label") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "");

  if (!label || !startDateRaw || !endDateRaw) {
    return { error: "Please fill in a label, start date, and end date." };
  }

  const payPeriod = await prisma.payPeriod.create({
    data: { label, startDate: new Date(startDateRaw), endDate: new Date(endDateRaw) },
  });

  revalidatePath("/staff/payroll");
  redirect(`/staff/payroll/${payPeriod.id}`);
}

export async function deletePayPeriodAction(payPeriodId: string) {
  await requireHrAccess();
  await prisma.payPeriod.delete({ where: { id: payPeriodId } });
  revalidatePath("/staff/payroll");
  redirect("/staff/payroll");
}

export interface EntryFormState {
  error?: string;
  success?: boolean;
}

export async function upsertPayrollEntryAction(
  payPeriodId: string,
  employeeId: string,
  _prevState: EntryFormState,
  formData: FormData
): Promise<EntryFormState> {
  try {
    await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const regularHours = parseFloat(String(formData.get("regularHours") ?? ""));
  const overtimeHoursRaw = String(formData.get("overtimeHours") ?? "").trim();
  const overtimeHours = overtimeHoursRaw ? parseFloat(overtimeHoursRaw) : 0;
  const attachmentDataUrl = String(formData.get("attachmentDataUrl") ?? "") || null;
  const attachmentFileName = String(formData.get("attachmentFileName") ?? "") || null;

  if (!Number.isFinite(regularHours) || regularHours < 0) {
    return { error: "Please enter a valid number of regular hours." };
  }

  await prisma.payrollEntry.upsert({
    where: { payPeriodId_employeeId: { payPeriodId, employeeId } },
    create: { payPeriodId, employeeId, regularHours, overtimeHours, attachmentDataUrl, attachmentFileName },
    update: {
      regularHours,
      overtimeHours,
      attachmentDataUrl,
      attachmentFileName,
      status: "PENDING",
      signedAt: null,
      signedName: null,
      signedPdfDataUrl: null,
      signatureReminderSentAt: null,
      disputeNote: null,
      disputedAt: null,
      resolutionNotes: null,
      resolvedAt: null,
    },
  });

  revalidatePath(`/staff/payroll/${payPeriodId}`);
  revalidatePath("/payroll");
  return { success: true };
}

export async function deletePayrollEntryAction(entryId: string, payPeriodId: string) {
  await requireHrAccess();
  await prisma.payrollEntry.delete({ where: { id: entryId } });
  revalidatePath(`/staff/payroll/${payPeriodId}`);
}

export interface CsvImportState {
  error?: string;
  imported?: number;
  errors?: string[];
}

export async function importPayrollCsvAction(
  payPeriodId: string,
  _prevState: CsvImportState,
  formData: FormData
): Promise<CsvImportState> {
  try {
    await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  // Avoid a bare `instanceof File` check — the global File constructor
  // isn't available on every Node.js runtime Next.js might be deployed to
  // (it only became a Node global in v20+), and referencing it throws a
  // ReferenceError before this line even runs its own logic. FormData
  // entries are only ever a string or a File, so ruling out string is
  // enough to know it's a file.
  const file = formData.get("csvFile");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "Please choose a file to upload." };
  }

  const isExcel = /\.xlsx?$/i.test(file.name);
  const result = isExcel
    ? await importPayrollExcel(payPeriodId, await file.arrayBuffer())
    : await importPayrollCsv(payPeriodId, await file.text());

  revalidatePath(`/staff/payroll/${payPeriodId}`);
  revalidatePath("/payroll");
  return { imported: result.imported, errors: result.errors };
}

export interface AttachUnmatchedState {
  error?: string;
}

export async function attachUnmatchedPayrollReportAction(
  unmatchedId: string,
  payPeriodId: string,
  _prevState: AttachUnmatchedState,
  formData: FormData
): Promise<AttachUnmatchedState> {
  try {
    await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { error: "Please choose an employee to attach this to." };

  const error = await attachUnmatchedPayrollReport(unmatchedId, employeeId);
  if (error) return { error };

  revalidatePath(`/staff/payroll/${payPeriodId}`);
  revalidatePath("/payroll");
  return {};
}

export async function dismissUnmatchedPayrollReportAction(unmatchedId: string, payPeriodId: string) {
  await requireHrAccess();
  await dismissUnmatchedPayrollReport(unmatchedId);
  revalidatePath(`/staff/payroll/${payPeriodId}`);
}

export async function resolveDisputeAction(
  entryId: string,
  payPeriodId: string,
  resolutionNotes: string
) {
  await requireHrAccess();

  // Sends it back to PENDING rather than auto-approving — the employee
  // still needs to actually review and sign off on the corrected hours.
  await prisma.payrollEntry.update({
    where: { id: entryId },
    data: {
      status: "PENDING",
      resolutionNotes: resolutionNotes.trim() || null,
      resolvedAt: new Date(),
    },
  });

  revalidatePath(`/staff/payroll/${payPeriodId}`);
  revalidatePath("/payroll");
}

export async function signPayrollEntryAction(entryId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const signedName = String(formData.get("signedName") ?? "").trim();
  const agreed = formData.get("agreed") === "on";
  if (!signedName || !agreed) return;

  const entry = await getPayrollEntryForSigning(entryId, session.sub);
  if (!entry) return;

  const signedAt = new Date();
  const signedPdfDataUrl = await renderPayrollEntryPdf({ ...entry, signedName, signedAt });

  await prisma.payrollEntry.update({
    where: { id: entryId },
    data: {
      status: "APPROVED",
      signedAt,
      signedName,
      signedPdfDataUrl,
      disputeNote: null,
      disputedAt: null,
    },
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${entryId}`);
  redirect("/payroll");
}

export interface OverrideSignState {
  error?: string;
  success?: boolean;
}

// HR-recorded approval for an employee who signed a physical copy instead
// of using the app — same effect as signPayrollEntryAction (status
// APPROVED, a signed PDF generated) but attributed to whoever recorded it
// rather than presented as the employee's own e-signature.
export async function overridePayrollEntrySignAction(
  entryId: string,
  payPeriodId: string,
  _prevState: OverrideSignState,
  formData: FormData
): Promise<OverrideSignState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const signedName = String(formData.get("signedName") ?? "").trim();
  if (!signedName) return { error: "Please enter the name as it was signed on the physical copy." };
  const overrideNote = String(formData.get("overrideNote") ?? "").trim() || null;
  const scanDataUrl = String(formData.get("scanDataUrl") ?? "") || null;
  const scanFileName = String(formData.get("scanFileName") ?? "") || null;

  const entry = await getPayrollEntryForOverride(entryId);
  if (!entry) return { error: "Payroll entry not found." };

  const signedAt = new Date();
  const signedPdfDataUrl = await renderPayrollEntryPdf({
    ...entry,
    signedName,
    signedAt,
    overrideRecordedBy: session.name,
    overrideNote,
  });

  await prisma.payrollEntry.update({
    where: { id: entryId },
    data: {
      status: "APPROVED",
      signedAt,
      signedName,
      signedPdfDataUrl,
      signedViaOverride: true,
      overriddenById: session.sub,
      overrideNote,
      disputeNote: null,
      disputedAt: null,
      ...(scanDataUrl ? { attachmentDataUrl: scanDataUrl, attachmentFileName: scanFileName } : {}),
    },
  });

  revalidatePath(`/staff/payroll/${payPeriodId}`);
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${entryId}`);
  return { success: true };
}

export async function disputePayrollEntryAction(entryId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const disputeNote = String(formData.get("disputeNote") ?? "").trim();
  if (!disputeNote) return;

  const entry = await prisma.payrollEntry.findUnique({
    where: { id: entryId },
    include: { employee: { select: { name: true } }, payPeriod: { select: { label: true } } },
  });
  if (!entry || entry.employeeId !== session.sub) return;

  await prisma.payrollEntry.update({
    where: { id: entryId },
    data: { status: "DISPUTED", disputeNote, disputedAt: new Date() },
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${entryId}`);

  const result = await sendEmail({
    to: "HR@mamascleaningcrew.com",
    subject: `Payroll question from ${entry.employee.name} — ${entry.payPeriod.label}`,
    body: `${entry.employee.name} flagged a question about their hours for the pay period "${entry.payPeriod.label}":\n\n${disputeNote}\n\nReview it in the admin portal under Payroll.`,
  });
  if (!result.ok) {
    console.error("Failed to send payroll dispute email to HR:", result.error);
  }

  redirect("/payroll");
}
