import { prisma } from "@/lib/prisma";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";

// Backs the pricing/quotes tool's window.storage abstraction (get/set/
// delete/list by key) with the shared Postgres database instead of browser
// localStorage, so quotes, cost settings, and profitability data are the
// same for everyone with Sales access, on any device. A single RPC-style
// endpoint mirrors the tool's four operations directly — see the matching
// client-side glue injected into src/content/sales-pricing-tool.html.
export const dynamic = "force-dynamic";

interface StorageRequestBody {
  op: "get" | "set" | "delete" | "list";
  key?: string;
  value?: string;
  prefix?: string;
}

export async function POST(request: Request) {
  const session = await requireSalesApiAccess();
  if (!session) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json()) as StorageRequestBody;

  switch (body.op) {
    case "get": {
      if (!body.key) return Response.json({ error: "Missing key" }, { status: 400 });
      const row = await prisma.salesToolData.findUnique({ where: { key: body.key } });
      if (!row) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json({ key: row.key, value: row.value, shared: true });
    }

    case "set": {
      if (!body.key || body.value === undefined) {
        return Response.json({ error: "Missing key or value" }, { status: 400 });
      }
      await prisma.salesToolData.upsert({
        where: { key: body.key },
        create: { key: body.key, value: body.value },
        update: { value: body.value },
      });

      // Two-way sync with the Lead pipeline: a quote marked Won/Lost inside
      // the pricing tool moves its linked Lead (by quoteKey) to match,
      // logging a stage-history entry the same as a manual move would.
      // Never downgrades a Lead that's already Won/Lost from some other
      // change, and does nothing if the quote isn't linked to any lead.
      if (body.key.startsWith("quote:")) {
        try {
          const quoteData = JSON.parse(body.value) as { status?: string };
          if (quoteData.status === "won" || quoteData.status === "lost") {
            const quoteId = body.key.slice("quote:".length);
            const lead = await prisma.lead.findFirst({ where: { quoteKey: quoteId } });
            if (lead && lead.stage !== "WON" && lead.stage !== "LOST") {
              const toStage = quoteData.status === "won" ? "WON" : "LOST";
              await prisma.lead.update({
                where: { id: lead.id },
                data: {
                  stage: toStage,
                  ...(toStage === "LOST" && !lead.lostReason
                    ? { lostReason: "Quote marked Lost in Pricing Tool" }
                    : {}),
                },
              });
              await prisma.leadStageChange.create({
                data: { leadId: lead.id, fromStage: lead.stage, toStage, changedById: session.sub },
              });
            }
          }
        } catch {
          // Malformed quote JSON — best-effort sync, skip silently.
        }
      }

      return Response.json({ key: body.key, value: body.value, shared: true });
    }

    case "delete": {
      if (!body.key) return Response.json({ error: "Missing key" }, { status: 400 });
      const existing = await prisma.salesToolData.findUnique({ where: { key: body.key } });
      if (existing) await prisma.salesToolData.delete({ where: { key: body.key } });
      return Response.json({ key: body.key, deleted: !!existing, shared: true });
    }

    case "list": {
      const rows = await prisma.salesToolData.findMany({
        where: body.prefix ? { key: { startsWith: body.prefix } } : undefined,
        select: { key: true },
      });
      return Response.json({ keys: rows.map((r) => r.key), prefix: body.prefix ?? "", shared: true });
    }

    default:
      return Response.json({ error: "Unknown op" }, { status: 400 });
  }
}
