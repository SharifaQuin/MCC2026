"use server";

import { headers } from "next/headers";
import {
  createRescheduleRequest,
  maybeSendAutomaticReceipt,
  sendNewRequestStaffAlert,
  type RawRescheduleInput,
} from "@/lib/rescheduleRequests";
import { recheckOpenOption, type OpenOptionRecheckStatus } from "@/lib/slotCapacitySummary";
import { checkRateLimit } from "@/lib/rateLimit";

// Cloudflare Turnstile — entirely optional, same "if configured" pattern as
// /lead-form's own verifyTurnstile: no secret key configured means the
// widget never rendered client-side either, so this just skips
// verification rather than blocking every submission.
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
    return true;
  }
}

function clientIp(): string {
  const h = headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

export type SubmitRescheduleResult =
  | { ok: true; statusUrl: string | null; optionRecheck?: OpenOptionRecheckStatus }
  | { ok: false; error: string };

export async function submitRescheduleRequestAction(formData: FormData): Promise<SubmitRescheduleResult> {
  // Honeypot — a real visitor never fills in this hidden field. Pretend
  // success without creating anything or sending anything, so a bot never
  // learns its submission was rejected.
  if (String(formData.get("website") ?? "").trim()) {
    return { ok: true, statusUrl: null };
  }

  if (!checkRateLimit(`reschedule:${clientIp()}`)) {
    return { ok: false, error: "Too many requests from this connection — please try again in a little while." };
  }

  const turnstileOk = await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""));
  if (!turnstileOk) {
    return { ok: false, error: "Captcha verification failed — please try again." };
  }

  const raw: RawRescheduleInput = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    note: String(formData.get("note") ?? ""),
    currentAppointmentDate: String(formData.get("currentAppointmentDate") ?? ""),
    type: String(formData.get("type") ?? ""),
    arrivalWindow: String(formData.get("arrivalWindow") ?? ""),
    frequency: String(formData.get("frequency") ?? ""),
    chosenOptionDate: String(formData.get("chosenOptionDate") ?? ""),
    chosenOptionBlock: String(formData.get("chosenOptionBlock") ?? ""),
    chosenOptionFeedMonthId: String(formData.get("chosenOptionFeedMonthId") ?? ""),
    preferredDateText: String(formData.get("preferredDateText") ?? ""),
  };

  const result = await createRescheduleRequest(raw);
  if (!result.ok) return result;

  // Recheck the specific chosen (date, block) opening, if any — purely
  // informational, shown back to the customer; this never rejects or
  // blocks the submission, which has already been saved.
  let optionRecheck: OpenOptionRecheckStatus | undefined;
  if (raw.chosenOptionFeedMonthId.trim() && raw.chosenOptionDate.trim() && raw.chosenOptionBlock.trim()) {
    optionRecheck = await recheckOpenOption(raw.chosenOptionFeedMonthId.trim(), raw.chosenOptionDate.trim(), raw.chosenOptionBlock.trim());
  }

  const statusUrl = `/reschedule/status/${result.statusToken}`;

  await maybeSendAutomaticReceipt(result.id, statusUrl);
  // Best-effort, same as notifyNewLead — an alert failure must never block
  // the form's own confirmation.
  await sendNewRequestStaffAlert({ id: result.id, type: result.type, currentAppointmentDate: result.currentAppointmentDate });

  return { ok: true, statusUrl, optionRecheck };
}
