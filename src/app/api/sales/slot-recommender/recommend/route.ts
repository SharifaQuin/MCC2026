import { prisma } from "@/lib/prisma";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { hasDepartmentAccess } from "@/lib/departments";
import { recommendSlots, cityFromAddress } from "@/lib/slotRecommender";

// Reps see headline/route badge/reason/repeat check only. Score, drive cost,
// and day status are manager-only (BUILD_SPEC §4) — computed here and
// stripped before the response reaches anyone without Management access,
// never left to the client to hide.
export const dynamic = "force-dynamic";

interface RecommendBody {
  month: string;
  address: string;
  price?: number;
  personHours?: number;
  frequency?: string;
  today?: string;
  constraints?: { weekdays?: string[]; blocks?: string[]; earliest?: string; latest?: string };
}

export async function POST(request: Request) {
  const session = await requireSalesApiAccess();
  if (!session) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const isManager = hasDepartmentAccess(session.role, grants, "MANAGEMENT").canView;

  const body = (await request.json()) as RecommendBody;
  if (!body.address || !body.month) {
    return Response.json({ error: "Missing address or month" }, { status: 400 });
  }

  if (!cityFromAddress(body.address)) {
    return Response.json({
      lead: { address: body.address, city: "", personHours: 0 },
      results: [],
      warnings: ["Could not locate this address — fix it and try again. No results are shown until the address resolves."],
    });
  }

  const result = await recommendSlots({
    month: body.month,
    address: body.address,
    quote: { price: body.price, personHours: body.personHours, frequency: body.frequency },
    today: body.today,
    constraints: body.constraints,
  });

  const results = result.results.map((c) => {
    if (isManager) return c;
    const { score, estDriveCost, dayStatus, dayOpenHours, ...repCard } = c;
    return repCard;
  });

  return Response.json({ ...result, results, isManager });
}
