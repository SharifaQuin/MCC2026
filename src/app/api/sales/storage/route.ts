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
