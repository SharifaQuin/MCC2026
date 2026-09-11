"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { importPayrollCsv } from "@/lib/payroll";
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

  revalidatePath("/admin/payroll");
  redirect(`/admin/payroll/${payPeriod.id}`);
}

export async function deletePayPeriodAction(payPeriodId: string) {
  await requireHrAccess();
  await prisma.payPeriod.delete({ where: { id: payPeriodId } });
  revalidatePath("/admin/payroll");
  redirect("/admin/payroll");
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
      disputeNote: null,
      disputedAt: null,
      resolutionNotes: null,
      resolvedAt: null,
    },
  });

  revalidatePath(`/admin/payroll/${payPeriodId}`);
  revalidatePath("/payroll");
  return { success: true };
}

export async function deletePayrollEntryAction(entryId: string, payPeriodId: string) {
  await requireHrAccess();
  await prisma.payrollEntry.delete({ where: { id: entryId } });
  revalidatePath(`/admin/payroll/${payPeriodId}`);
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

  const file = formData.get("csvFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file to upload." };
  }

  const text = await file.text();
  const result = await importPayrollCsv(payPeriodId, text);

  revalidatePath(`/admin/payroll/${payPeriodId}`);
  revalidatePath("/payroll");
  return { imported: result.imported, errors: result.errors };
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

  revalidatePath(`/admin/payroll/${payPeriodId}`);
  revalidatePath("/payroll");
}

export async function signPayrollEntryAction(entryId: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const signedName = String(formData.get("signedName") ?? "").trim();
  const agreed = formData.get("agreed") === "on";
  if (!signedName || !agreed) return;

  const entry = await prisma.payrollEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.employeeId !== session.sub) return;

  await prisma.payrollEntry.update({
    where: { id: entryId },
    data: { status: "APPROVED", signedAt: new Date(), signedName, disputeNote: null, disputedAt: null },
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${entryId}`);
  redirect("/payroll");
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
