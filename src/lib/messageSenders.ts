// Shared by scheduledMessageScheduler.ts and leadAutoReply.ts — both send
// via RingCentral/Graph and both need a way to inject a fake sendEmail/
// sendSms in tests (including ones that throw, to prove a provider
// exception doesn't crash the caller) without a mocking framework.
import { sendEmail as realSendEmail } from "@/lib/email";
import { sendSms as realSendSms } from "@/lib/sms";

export interface MessageSenders {
  sendEmail: typeof realSendEmail;
  sendSms: typeof realSendSms;
}

export const DEFAULT_SENDERS: MessageSenders = { sendEmail: realSendEmail, sendSms: realSendSms };
