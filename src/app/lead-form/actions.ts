"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { LeadSource } from "@prisma/client";
import {
  parseLeadSource,
  notifyNewLead,
  getLeadFormConfig,
  LEAD_SERVICE_LABELS,
  LEAD_FREQUENCY_LABELS,
  LEAD_HOW_HEARD_OPTIONS,
  createDraftQuoteForLead,
  ARCHIVED_LEAD_STAGES,
} from "@/lib/leads";
import { maybeSendAfterHoursAutoReply } from "@/lib/leadAutoReply";

const VALID_HOW_HEARD_VALUES = new Set(LEAD_HOW_HEARD_OPTIONS.map((o) => o.value));

// Cloudflare Turnstile — entirely optional. If the site/secret keys aren't
// configured yet (the owner hasn't signed up), the widget doesn't render
// and this just skips verification, so the form keeps working either way.
async function verifyTurnstile(token: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true;
  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // A verification-service outage shouldn't be able to block every
    // submission — fail open rather than silently losing real leads.
    return true;
  }
}

export async function submitLeadAction(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const serviceKey = String(formData.get("serviceInterest") ?? "").trim() || null;
  const squareFootageRaw = String(formData.get("squareFootage") ?? "").trim();
  const squareFootage = squareFootageRaw ? parseInt(squareFootageRaw, 10) || null : null;
  const frequencyKey = String(formData.get("frequency") ?? "").trim();
  const frequency = LEAD_FREQUENCY_LABELS[frequencyKey] ?? null;
  const message = String(formData.get("message") ?? "").trim() || null;
  // The visible "How did you hear about us?" dropdown is authoritative —
  // it's the customer's own direct answer. The ?src= campaign tag only
  // pre-selects a default for them to confirm or change (see the form page).
  const howHeardRaw = String(formData.get("howHeard") ?? "").trim();
  const source: LeadSource = VALID_HOW_HEARD_VALUES.has(howHeardRaw)
    ? (howHeardRaw as LeadSource)
    : parseLeadSource(String(formData.get("src") ?? ""));

  // Honeypot — a real visitor never fills in this hidden field. Silently
  // "succeed" so a bot doesn't learn its submission was rejected.
  if (String(formData.get("website") ?? "").trim()) {
    redirect("/lead-form/thank-you");
  }

  const turnstileOk = await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""));
  if (!turnstileOk) {
    redirect("/lead-form?error=captcha");
  }

  if (!firstName || !lastName || !email || !phone || !VALID_HOW_HEARD_VALUES.has(howHeardRaw)) {
    redirect("/lead-form?error=incomplete");
  }

  const [config, fields] = await Promise.all([
    getLeadFormConfig(),
    prisma.leadFormField.findMany({ orderBy: { order: "asc" } }),
  ]);

  if (
    (config.addressRequired && !address) ||
    (config.serviceInterestRequired && !serviceKey) ||
    (config.messageRequired && !message) ||
    (config.serviceInterestEnabled && !squareFootage) ||
    (config.serviceInterestEnabled && !frequency)
  ) {
    redirect("/lead-form?error=incomplete");
  }

  const customFields: { label: string; value: string }[] = [];
  for (const field of fields) {
    const value = String(formData.get(`custom_${field.id}`) ?? "").trim();
    if (field.required && !value) {
      redirect("/lead-form?error=incomplete");
    }
    if (value) customFields.push({ label: field.label, value });
  }

  // An Unable-to-Contact lead is treated the same as a Lost one here — it's
  // a paused dead end, not a live inquiry someone is already working — so a
  // fresh submission from the same email creates a brand-new Lead instead
  // of silently vanishing into one nobody could reach. Only a genuinely
  // still-active inquiry (not yet Won/Lost/Unable-to-Contact) is treated as
  // "already being handled."
  const existing = await prisma.lead.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, stage: { notIn: ["WON", ...ARCHIVED_LEAD_STAGES] } },
  });
  if (existing) {
    redirect("/lead-form/thank-you");
  }

  const serviceInterest = serviceKey ? (LEAD_SERVICE_LABELS[serviceKey] ?? serviceKey) : null;

  const lead = await prisma.lead.create({
    data: {
      firstName,
      lastName,
      email,
      phone,
      address,
      serviceInterest,
      squareFootage,
      frequency,
      message,
      source,
      customFields: customFields.length > 0 ? customFields : undefined,
    },
  });

  if (serviceKey) {
    const quoteId = await createDraftQuoteForLead({
      id: lead.id,
      firstName,
      lastName,
      email,
      phone,
      address,
      message,
      serviceKey,
      squareFootage,
    });
    if (quoteId) {
      await prisma.lead.update({ where: { id: lead.id }, data: { quoteKey: quoteId } });
    }
  }

  await notifyNewLead(lead);

  // Best-effort, same as notifyNewLead above — an after-hours auto-reply
  // failing should never block the form's own redirect.
  try {
    await maybeSendAfterHoursAutoReply(lead);
  } catch (err) {
    console.error("[leadAutoReply] failed:", err);
  }

  redirect("/lead-form/thank-you");
}
