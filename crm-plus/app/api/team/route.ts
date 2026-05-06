import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const ASSIGNABLE_ROLES = ["owner", "manager", "salesperson", "attendant", "financial", "viewer"] as const;

// GET /api/team — list all users in tenant
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "team")) return forbidden();

  const users = await prisma.user.findMany({
    where:   { tenantId: session.tenantId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, phone: true,
      role: true, isActive: true, lastLoginAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ data: users });
}

const createSchema = z.object({
  name:     z.string().min(2).max(255),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(ASSIGNABLE_ROLES),
  phone:    z.string().max(50).optional(),
});

// POST /api/team — create new team member
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "team")) return forbidden();

  const body   = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });

  const { name, email, password, role, phone } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { tenantId: session.tenantId, email },
  });
  if (existing)
    return NextResponse.json({ error: "E-mail já cadastrado nesta empresa." }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      tenantId: session.tenantId,
      name,
      email,
      passwordHash,
      role,
      phone:    phone ?? null,
      isActive: true,
    },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
  });

  return NextResponse.json({ data: user }, { status: 201 });
}
