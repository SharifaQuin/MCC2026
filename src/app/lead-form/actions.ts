"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseLeadSource, notifyNewLead } from "@/lib/leads";

export async function submitLeadAction(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const serviceInterest = String(formData.get("serviceInterest") ?? "").trim() || null;
  const message = String(formData.get("message") ?? "").trim() || null;
  const source = parseLeadSource(String(formData.get("src") ?? ""));

  // Honeypot — a real visitor never fills in this hidden field. Silently
  // "succeed" so a bot doesn't learn its submission was rejected.
  if (String(formData.get("website") ?? "").trim()) {
    redirect("/lead-form/thank-you");
  }

  if (!firstName || !lastName || !email || !phone) {
    redirect("/lead-form?error=incomplete");
  }

  const existing = await prisma.lead.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, stage: { notIn: ["WON", "LOST"] } },
  });
  if (existing) {
    redirect("/lead-form/thank-you");
  }

  const lead = await prisma.lead.create({
    data: { firstName, lastName, email, phone, address, serviceInterest, message, source },
  });

  await notifyNewLead(lead);

  redirect("/lead-form/thank-you");
}
