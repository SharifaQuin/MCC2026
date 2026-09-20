"use client";

import { useEffect, useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { sendAssistantMessageAction } from "@/app/actions/assistant";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolsUsed?: string[];
}

const TOOL_LABELS: Record<string, string> = {
  get_financial_overview: "Financial overview",
  get_financial_month: "Monthly financials",
  get_sales_overview: "Sales overview",
  get_hr_overview: "HR overview",
  get_checklist_tasks: "Checklist tasks",
};

export default function AssistantChat() {
  const [history, setHistory] = useState<Anthropic.MessageParam[]>([]);
  const [display, setDisplay] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [display, pending]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    setInput("");
    setError(null);
    setDisplay((d) => [...d, { role: "user", text }]);
    setPending(true);

    const result = await sendAssistantMessageAction(history, text);

    setPending(false);
    if (result.error || !result.messages) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    setHistory(result.messages);
    setDisplay((d) => [...d, { role: "assistant", text: result.reply ?? "", toolsUsed: result.toolsUsed }]);
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-lg border border-neutral-200 bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {display.length === 0 && (
          <p className="text-sm text-neutral-400">
            Ask about your financials, sales pipeline, HR/training, or checklist — e.g. &quot;How did we do
            last month?&quot; or &quot;What leads need follow-up?&quot;
          </p>
        )}
        {display.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${
                m.role === "user" ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-800"
              }`}
            >
              {m.text}
            </div>
            {m.toolsUsed && m.toolsUsed.length > 0 && (
              <p className="mt-1 text-[11px] text-neutral-400">
                Checked: {Array.from(new Set(m.toolsUsed)).map((t) => TOOL_LABELS[t] ?? t).join(", ")}
              </p>
            )}
          </div>
        ))}
        {pending && <p className="text-sm text-neutral-400">Thinking...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-neutral-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the business..."
          disabled={pending}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
