import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import type { TaskStatus, TaskPriority } from "@/lib/generated/prisma/enums";

const VALID_STATUSES: TaskStatus[]   = ["pending", "done", "cancelled"];
const VALID_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

const createSchema = z.object({
  title:          z.string().min(1).max(255),
  description:    z.string().max(2000).optional().nullable(),
  contactId:      z.string().uuid().optional().nullable(),
  opportunityId:  z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  dueAt:          z.string().datetime().optional().nullable(),
  priority:       z.enum(["low", "medium", "high"]).optional(),
  source:         z.enum(["manual", "ai"]).optional(),
});

// GET /api/tasks
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "tasks")) return forbidden();

  const { searchParams } = new URL(req.url);
  const rawStatus   = searchParams.get("status");
  const contactId   = searchParams.get("contactId") ?? undefined;
  const oppId       = searchParams.get("opportunityId") ?? undefined;
  const source      = searchParams.get("source") ?? undefined;
  const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit       = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  const statusFilter: TaskStatus | undefined =
    rawStatus && VALID_STATUSES.includes(rawStatus as TaskStatus)
      ? (rawStatus as TaskStatus)
      : undefined;

  const where = {
    tenantId: session.tenantId,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(contactId ? { contactId } : {}),
    ...(oppId ? { opportunityId: oppId } : {}),
    ...(source ? { source } : {}),
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id:          true,
        title:       true,
        description: true,
        status:      true,
        priority:    true,
        source:      true,
        dueAt:       true,
        createdAt:   true,
        contact:     { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
        assignedUser:{ select: { id: true, name: true } },
      },
    }),
    prisma.task.count({ where }),
  ]);

  return NextResponse.json({
    data: tasks,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "tasks")) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const task = await prisma.task.create({
    data: {
      tenantId:       session.tenantId,
      title:          d.title,
      description:    d.description ?? null,
      contactId:      d.contactId ?? null,
      opportunityId:  d.opportunityId ?? null,
      assignedUserId: d.assignedUserId ?? null,
      dueAt:          d.dueAt ? new Date(d.dueAt) : null,
      priority:       (d.priority as TaskPriority) ?? "medium",
      source:         d.source ?? "manual",
    },
    select: {
      id: true, title: true, description: true, status: true,
      priority: true, source: true, dueAt: true, createdAt: true,
      contact:     { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({ data: task }, { status: 201 });
}
