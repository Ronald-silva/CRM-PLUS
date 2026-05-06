import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { ensureDefaultPipeline } from "@/lib/db/ensure-default-pipeline";
import { OpportunitiesClient } from "./opportunities-client";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; pipelineId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "opportunities")) redirect("/dashboard");

  const tenantId = session.user.tenantId;
  await ensureDefaultPipeline(tenantId);

  const params = await searchParams;
  const search = params.q ?? "";
  const page = Math.max(1, Number(params.page ?? 1));
  const statusFilter = ["open", "won", "lost"].includes(params.status ?? "") ? params.status! : undefined;
  const pipelineFilter = params.pipelineId ?? undefined;
  const limit = 50;

  const where = {
    tenantId,
    ...(pipelineFilter ? { pipelineId: pipelineFilter } : {}),
    ...(statusFilter ? { status: statusFilter as "open" | "won" | "lost" } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [opportunities, total, pipelines, contacts, companies, users, allProducts] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        value: true,
        status: true,
        expectedCloseAt: true,
        closedAt: true,
        createdAt: true,
        contact: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, probability: true } },
        assignedUser: { select: { id: true, name: true } },
        products: {
          orderBy: { createdAt: "asc" as const },
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            productId: true,
            product: { select: { id: true, name: true, category: true } },
          },
        },
      },
    }),
    prisma.opportunity.count({ where }),
    prisma.pipeline.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        isDefault: true,
        stages: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true, probability: true } },
      },
    }),
    prisma.contact.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
    prisma.company.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { tenantId, status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true, category: true },
    }),
  ]);

  return (
    <OpportunitiesClient
      opportunities={opportunities}
      total={total}
      page={page}
      search={search}
      statusFilter={statusFilter ?? ""}
      pipelineFilter={pipelineFilter ?? ""}
      pipelines={pipelines}
      contacts={contacts}
      companies={companies}
      users={users}
      allProducts={allProducts}
      canCreate={can(session.user.role, "create", "opportunities")}
      canEdit={can(session.user.role, "update", "opportunities")}
      canDelete={can(session.user.role, "delete", "opportunities")}
    />
  );
}
