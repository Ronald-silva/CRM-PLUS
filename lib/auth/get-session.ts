import { auth } from "./auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/generated/prisma/enums";

export interface SessionUser {
  id: string;
  tenantId: string;
  tenantSlug: string;
  role: UserRole;
  name?: string | null;
  email?: string | null;
}

export async function getSession(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.tenantId) return null;
  return session.user as SessionUser;
}

export function unauthorized() {
  return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
}
