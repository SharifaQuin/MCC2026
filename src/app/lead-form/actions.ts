"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  parseLeadSource,
  notifyNewLead,
  getLeadFormConfig,
  LEAD_SERVICE_LABELS,
  createDraftQuoteForLead,
} from "@/lib/leads";

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
  const message = String(formData.get("message") ?? "").trim() || null;
  const source = parseLeadSource(String(formData.get("src") ?? ""));

  // Honeypot — a real visitor never fills in this hidden field. Silently
  // "succeed" so a bot doesn't learn its submission was rejected.
  if (String(formData.get("website") ?? "").trim()) {
    redirect("/lead-form/thank-you");
  }

  const turnstileOk = await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""));
  if (!turnstileOk) {
    redirect("/lead-form?error=captcha");
  }

  if (!firstName || !lastName || !email || !phone) {
    redirect("/lead-form?error=incomplete");
  }

  const [config, fields] = await Promise.all([
    getLeadFormConfig(),
    prisma.leadFormField.findMany({ orderBy: { order: "asc" } }),
  ]);

  if (
    (config.addressRequired && !address) ||
    (config.serviceInterestRequired && !serviceKey) ||
    (config.messageRequired && !message)
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

  const existing = await prisma.lead.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, stage: { notIn: ["WON", "LOST"] } },
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

  redirect("/lead-form/thank-you");
}
