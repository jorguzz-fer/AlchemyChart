import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export type Role = "SUPERADMIN" | "ADMIN" | "SUPERVISOR" | "ANALYST" | "VIEWER";

export async function requireAuth() {
  const session = await auth();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export async function requireRole(roles: Role[]) {
  const { session, error } = await requireAuth();
  if (error) return { error };
  const role = session!.user.role as Role;
  if (!roles.includes(role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session: session! };
}

export const ROLES_ADMIN: Role[] = ["SUPERADMIN", "ADMIN"];
export const ROLES_MANAGE: Role[] = ["SUPERADMIN", "ADMIN", "SUPERVISOR"];
export const ROLES_WRITE: Role[] = ["SUPERADMIN", "ADMIN", "SUPERVISOR", "ANALYST"];
