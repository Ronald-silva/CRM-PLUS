import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { TasksClient } from "./tasks-client";
import type { TaskStatus, TaskPriority } from "@/lib/generated/prisma/enums";

const VALID_STATUSES: TaskStatus[]    = ["pending", "done", "cancelled"];
const VALID_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

function asStatus(v?: string): TaskStatus | undefined {
  return v && VALID_STATUSES.includes(v as TaskStatus) ? (v as TaskStatus) : undefined;
}
function asPriority(v?: string): TaskPriority | undefined {
  return v && VALID_PRIORITIES.includes(v as TaskPriority) ? (v as TaskPriority) : undefined;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    source?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "tasks")) redirect("/dashboard");

  const tenantId = session.user.tenantId;
  const p = await searchParams;
  const statusFilter   = asStatus(p.status);
  const priorityFilter = asPriority(p.priority);
  const sourceFilter   = ["ai", "manual"].includes(p.source ?? "") ? p.source : undefined;
  const page  = Math.max(1, Number(p.page ?? 1));
  const limit = 30;

  const where = {
    tenantId,
    ...(statusFilter   ? { status: statusFilter }     : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
    ...(sourceFilter   ? { source: sourceFilter }     : {}),
  };

  const [tasks, total, counts] = await Promise.all([
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
    prisma.task.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all])
  ) as Record<string, number>;

  const canUpdate = can(session.user.role, "update", "tasks");
  const canDelete = can(session.user.role, "delete", "tasks");
  const canCreate = can(session.user.role, "create", "tasks");

  return (
    <TasksClient
      tasks={tasks.map((t) => ({
        ...t,
        dueAt: t.dueAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      }))}
      total={total}
      page={page}
      limit={limit}
      statusCounts={statusCounts}
      canUpdate={canUpdate}
      canDelete={canDelete}
      canCreate={canCreate}
    />
  );
}
