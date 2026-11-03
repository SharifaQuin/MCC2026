import { prisma } from "@/lib/prisma";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { syncLeadFromQuote } from "@/lib/leads";
import { getTrueActorId } from "@/lib/impersonation";
import {
  isProfitabilityStorageKey,
  isSalesFinancialWriteKey,
  isSalesActualsStorageKey,
} from "@/lib/salesPricingToolAccess";
import { evaluateQuoteMarginHold, describeMarginHold, type QuoteMarginEvaluation } from "@/lib/pricingMargin";

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
  // The authenticated session's own role is the only thing that decides
  // this — never a client-supplied field, and this check applies
  // regardless of which `op` is used to reach a protected key, closing the
  // bypass a generic by-key storage endpoint would otherwise leave open
  // (requireSalesApiAccess above only confirms real Sales access, which a
  // view-only Sales viewer already has, same as an edit-capable one).
  const isAdmin = session.role === "ADMIN";

  const body = (await request.json()) as StorageRequestBody;

  switch (body.op) {
    case "get": {
      if (!body.key) return Response.json({ error: "Missing key" }, { status: 400 });
      if (!isAdmin && (isProfitabilityStorageKey(body.key) || isSalesActualsStorageKey(body.key))) {
        return Response.json({ error: "Not authorized" }, { status: 403 });
      }
      const row = await prisma.salesToolData.findUnique({ where: { key: body.key } });
      if (!row) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json({ key: row.key, value: row.value, shared: true });
    }

    case "set": {
      if (!body.key || body.value === undefined) {
        return Response.json({ error: "Missing key or value" }, { status: 400 });
      }
      // Sales goal: ADMIN-only to write (reads stay open to any authorized
      // Sales viewer via the "get" case above, unaffected here). Sales
      // actuals (revenue+labor) and profitability/cost-settings: ADMIN-only
      // for both reads and writes — see isSalesActualsStorageKey's own
      // comment for why actuals reads are denied outright rather than
      // stripped (labor is owner-only, revenue alone has no consumer here).
      if (!isAdmin && (isSalesFinancialWriteKey(body.key) || isProfitabilityStorageKey(body.key))) {
        return Response.json({ error: "Not authorized" }, { status: 403 });
      }

      // Item 3: for a `quote:`-prefixed key, compute the 10% margin-hold
      // check BEFORE persisting, and store its boolean result (`marginHold`)
      // onto the saved record itself — this makes it the one place a
      // Sales Rep's own save gets a correct, authoritative hold flag
      // without ever seeing the cost numbers behind it (those never leave
      // this function — see the response handling below). This is
      // authoritative at save time but NOT trusted again at send time:
      // src/app/api/sales/send-quote/route.ts recomputes it fresh, every
      // time, rather than reading this stored boolean back.
      let valueToStore = body.value;
      let marginEvaluation: QuoteMarginEvaluation | null = null;
      if (body.key.startsWith("quote:")) {
        try {
          const parsedForMargin = JSON.parse(body.value);
          marginEvaluation = evaluateQuoteMarginHold(parsedForMargin);
          parsedForMargin.marginHold = marginEvaluation.held;
          valueToStore = JSON.stringify(parsedForMargin);
        } catch (error) {
          // Never block a save because the margin check itself errored
          // (e.g. malformed quote JSON) — Item 3's actual enforcement point
          // is send-quote, not save; a save always succeeds regardless of
          // hold status.
          console.error(`Margin evaluation failed for ${body.key}:`, error);
        }
      }

      await prisma.salesToolData.upsert({
        where: { key: body.key },
        create: { key: body.key, value: valueToStore },
        update: { value: valueToStore },
      });

      // Two-way sync with the Lead pipeline: a quote marked Won/Lost inside
      // the pricing tool moves its linked Lead (by quoteKey) to match,
      // logging a stage-history entry the same as a manual move would.
      // Never downgrades a Lead that's already Won/Lost from some other
      // change, and does nothing if the quote isn't linked to any lead.
      if (body.key.startsWith("quote:")) {
        try {
          const quoteData = JSON.parse(valueToStore) as {
            status?: string;
            collectedVia?: string;
            clientName?: string;
            phone?: string;
            clientEmail?: string;
            address?: string;
            service?: string;
            suggested?: string;
            formState?: { sqft?: number };
          };
          const quoteId = body.key.slice("quote:".length);

          // Auto-create (or link) the matching Lead every time a quote is
          // saved, so no quote can exist without also landing on the Sales
          // pipeline/dashboard — see syncLeadFromQuote for why this runs in
          // the opposite direction from the web-form flow (quote first,
          // lead second).
          await syncLeadFromQuote(quoteId, quoteData, getTrueActorId(session));

          if (quoteData.status === "won" || quoteData.status === "lost") {
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
                data: { leadId: lead.id, fromStage: lead.stage, toStage, changedById: getTrueActorId(session) },
              });
            }
          }
        } catch (error) {
          // Best-effort sync — a failure here should never break saving the
          // quote itself, but it should be visible in server logs instead
          // of silently vanishing (a quote that never gets a Lead linked
          // is otherwise indistinguishable from one that worked fine).
          console.error(`Lead sync failed for ${body.key}:`, error);
        }
      }

      // Item 3: marginHold (boolean only — never a dollar figure) goes in
      // the response for every caller, since it's already been persisted on
      // the row and is safe for any authorized Sales viewer to read back
      // (there is no ADMIN-only restriction on reading a `quote:` key at
      // all). The specific reason/minimum-price text is ADMIN-only and
      // never persisted anywhere — composed here, transiently, from the
      // margin module's return value.
      const responseBody: Record<string, unknown> = { key: body.key, value: valueToStore, shared: true };
      if (marginEvaluation) {
        responseBody.marginHold = marginEvaluation.held;
        if (marginEvaluation.held && isAdmin) {
          responseBody.marginHoldReason = describeMarginHold(marginEvaluation);
        }
      }
      return Response.json(responseBody);
    }

    case "delete": {
      if (!body.key) return Response.json({ error: "Missing key" }, { status: 400 });
      if (!isAdmin && (isSalesFinancialWriteKey(body.key) || isProfitabilityStorageKey(body.key))) {
        return Response.json({ error: "Not authorized" }, { status: 403 });
      }
      const existing = await prisma.salesToolData.findUnique({ where: { key: body.key } });
      if (existing) await prisma.salesToolData.delete({ where: { key: body.key } });
      return Response.json({ key: body.key, deleted: !!existing, shared: true });
    }

    case "list": {
      const rows = await prisma.salesToolData.findMany({
        where: body.prefix ? { key: { startsWith: body.prefix } } : undefined,
        select: { key: true },
      });
      // Never list a profitability key's existence to a non-admin either —
      // the key names themselves (e.g. a client name baked into a saved
      // job id) are internal data, not just the values behind them.
      const keys = rows.map((r) => r.key).filter((key) => isAdmin || !isProfitabilityStorageKey(key));
      return Response.json({ keys, prefix: body.prefix ?? "", shared: true });
    }

    default:
      return Response.json({ error: "Unknown op" }, { status: 400 });
  }
}
