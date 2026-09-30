import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { setEnteredInTcs } from "@/lib/slotRecommender";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSalesApiAccess();
  if (!session) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json()) as { bookingId?: string; entered?: boolean };
  if (!body.bookingId) {
    return Response.json({ error: "Missing bookingId" }, { status: 400 });
  }

  const result = await setEnteredInTcs(body.bookingId, !!body.entered);
  if (!result.ok) {
    return Response.json({ ok: false, reason: result.reason }, { status: 409 });
  }
  return Response.json(result);
}
