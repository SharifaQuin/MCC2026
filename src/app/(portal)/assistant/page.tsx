import { isAssistantConfigured } from "@/lib/assistant";
import AssistantChat from "./AssistantChat";

export default function AssistantPage() {
  const configured = isAssistantConfigured();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">AI Assistant</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Owner-only — ask about financials, sales/leads, HR/training, or the checklist. Every answer is
        grounded in a live lookup of your real data, not a guess.
      </p>

      {configured ? (
        <AssistantChat />
      ) : (
        <p className="text-sm text-neutral-500">
          The assistant isn&apos;t set up yet — add ANTHROPIC_API_KEY to enable it.
        </p>
      )}
    </div>
  );
}
