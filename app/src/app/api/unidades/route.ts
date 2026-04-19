import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const units = await prisma.unit.findMany({
    where: { tenantId: session.user.tenantId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(units);
}
