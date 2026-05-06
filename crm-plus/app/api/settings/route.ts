import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

// GET /api/settings — read own tenant
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "settings")) return forbidden();

  const tenant = await prisma.tenant.findUnique({
    where:  { id: session.tenantId },
    select: { id: true, name: true, slug: true, plan: true, status: true, settings: true, createdAt: true, updatedAt: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

  return NextResponse.json({ data: tenant });
}

const patchSchema = z.object({
  name:     z.string().min(2).max(255).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

// PATCH /api/settings — update name and/or settings JSON
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "settings")) return forbidden();

  const body   = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });

  const current = await prisma.tenant.findUnique({
    where: { id: session.tenantId }, select: { settings: true },
  });
  if (!current) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

  const mergedSettings = parsed.data.settings
    ? { ...(current.settings as Record<string, unknown>), ...parsed.data.settings }
    : undefined;

  const tenant = await prisma.tenant.update({
    where: { id: session.tenantId },
    data:  {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(mergedSettings   ? { settings: mergedSettings as Record<string, string | number | boolean | null> } : {}),
    },
    select: { id: true, name: true, slug: true, plan: true, status: true, settings: true, updatedAt: true },
  });

  return NextResponse.json({ data: tenant });
}
