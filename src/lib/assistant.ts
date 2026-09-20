import Anthropic from "@anthropic-ai/sdk";
import {
  getMonthlyFinancials,
  getMonthlyFinancialsForMonth,
  getOwnerSettings,
  getOpenLoans,
  getChecklistTasksForRole,
} from "@/lib/financials";
import { loadLeadKpis, getLeadFunnelBySource } from "@/lib/leads";
import { loadAdminDashboard } from "@/lib/dashboard";
import { getTurnoverStats } from "@/lib/staff";
import { getHrTodayAttentionItems } from "@/lib/hrToday";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 5;

export function isAssistantConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("The AI assistant isn't configured yet — missing ANTHROPIC_API_KEY.");
  }
  return new Anthropic({ apiKey });
}

// Each tool wraps an existing, already-trusted data source in this app —
// the assistant never gets to invent numbers, it can only look up what's
// really in the database, the same data these dashboards already show.
const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_financial_overview",
    description:
      "Get the last several months of P&L summaries (revenue, gross profit, opex, net profit, margin), plus the owner draw policy, profitability target, and any open business loans.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_financial_month",
    description: "Get the full P&L detail for one specific month, including every line item.",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "Month in YYYY-MM format, e.g. 2026-08" },
      },
      required: ["month"],
    },
  },
  {
    name: "get_sales_overview",
    description:
      "Get sales/lead pipeline KPIs (pipeline value, average response time, uncontacted and overdue-follow-up counts, ad spend this month) and the conversion funnel broken down by lead source.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_hr_overview",
    description:
      "Get HR/training stats: headcount, training progress, certification pending/stalled lists, turnover rate over the last 90 days, and today's HR items needing attention (compliance docs, complaints, etc.).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_checklist_tasks",
    description: "Get the owner's recurring and one-time business checklist tasks and their current status.",
    input_schema: { type: "object", properties: {} },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_financial_overview": {
      const [months, ownerSettings, loans] = await Promise.all([
        getMonthlyFinancials(),
        getOwnerSettings(),
        getOpenLoans(),
      ]);
      return {
        recentMonths: months.slice(0, 6).map((m) => ({
          month: m.month,
          monthLabel: m.monthLabel,
          revenueTotal: m.revenueTotal,
          grossProfit: m.grossProfit,
          opexTotal: m.opexTotal,
          netProfit: m.netProfit,
          netMarginPct: m.netMarginPct,
          endingBankBalance: m.endingBankBalance,
        })),
        ownerDrawPolicy: ownerSettings.owner_draw_policy ?? null,
        profitabilityTarget: ownerSettings.profitability_target ?? null,
        openLoans: loans,
      };
    }
    case "get_financial_month": {
      const month = String(input.month ?? "");
      const record = await getMonthlyFinancialsForMonth(month);
      return record ?? { error: `No financial data entered for ${month}.` };
    }
    case "get_sales_overview": {
      const [kpis, funnel] = await Promise.all([loadLeadKpis(), getLeadFunnelBySource()]);
      return { kpis, funnelBySource: funnel };
    }
    case "get_hr_overview": {
      const [dashboard, turnover, hrToday] = await Promise.all([
        loadAdminDashboard(),
        getTurnoverStats(90),
        getHrTodayAttentionItems(),
      ]);
      return { dashboard, turnover, hrToday };
    }
    case "get_checklist_tasks": {
      return getChecklistTasksForRole("ADMIN");
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const SYSTEM_PROMPT = `You are the business assistant built into Mama's Cleaning Crew's internal Owner's Dashboard. You answer the owner's questions about the business using the tools provided — never guess, estimate, or make up a number. If a question needs data outside what your tools cover, say so plainly rather than guessing. Keep answers concise and concrete, citing the actual figures you looked up. This is an internal tool for the business owner only.`;

export interface AssistantTurnResult {
  messages: Anthropic.MessageParam[];
  reply: string;
  toolsUsed: string[];
}

export async function runAssistantConversation(
  priorMessages: Anthropic.MessageParam[],
  userText: string
): Promise<AssistantTurnResult> {
  const client = getClient();
  const messages: Anthropic.MessageParam[] = [...priorMessages, { role: "user", content: userText }];
  const toolsUsed: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n\n");
      return { messages, reply, toolsUsed };
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        toolsUsed.push(block.name);
        try {
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
          return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
        } catch (error) {
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: error instanceof Error ? error.message : "Tool failed" }),
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "user", content: toolResults });
  }

  return {
    messages,
    reply: "I wasn't able to finish looking that up — try asking a more specific question.",
    toolsUsed,
  };
}
