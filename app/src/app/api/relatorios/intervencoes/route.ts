import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const runs = await prisma.run.findMany({
    where: {
      status: "REJECT",
      analyte: { unitRel: { tenantId: session.user.tenantId } },
    },
    include: {
      analyte: { select: { id: true, name: true, level: true } },
      equipment: { select: { id: true, name: true } },
      user: { select: { name: true } },
    },
    orderBy: { runAt: "desc" },
    take: 200,
  });

  return NextResponse.json(runs);
}
