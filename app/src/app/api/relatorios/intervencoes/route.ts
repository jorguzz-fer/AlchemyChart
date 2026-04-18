import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
