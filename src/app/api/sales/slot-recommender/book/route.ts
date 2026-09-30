import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { holdSlot } from "@/lib/slotRecommender";

export const dynamic = "force-dynamic";

interface BookBody {
  month: string;
  date: string;
  block: string;
  window: string;
  city: string;
  address: string;
  personHours: number;
  price?: number;
  frequency?: string;
  leadId?: string;
}

export async function POST(request: Request) {
  const session = await requireSalesApiAccess();
  if (!session) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json()) as BookBody;
  if (!body.month || !body.date || !body.block || !body.window || !body.address || !body.personHours) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await holdSlot({ ...body, repId: session.sub });
  if (!result.ok) {
    return Response.json({ ok: false, reason: result.reason }, { status: 409 });
  }
  return Response.json(result);
}
