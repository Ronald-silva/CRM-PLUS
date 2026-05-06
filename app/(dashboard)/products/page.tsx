import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { ProductsClient } from "./products-client";
import type { ProductStatus } from "@/lib/generated/prisma/enums";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "products")) redirect("/dashboard");

  const params = await searchParams;
  const search = params.q ?? "";
  const page = Math.max(1, Number(params.page ?? 1));
  const statusFilter: ProductStatus | undefined =
    params.status === "active" || params.status === "inactive"
      ? params.status
      : undefined;
  const limit = 20;

  const where = {
    tenantId: session.user.tenantId,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { category: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        category: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  return (
    <ProductsClient
      products={products}
      total={total}
      page={page}
      search={search}
      statusFilter={statusFilter ?? ""}
      canCreate={can(session.user.role, "create", "products")}
      canEdit={can(session.user.role, "update", "products")}
      canDelete={can(session.user.role, "delete", "products")}
    />
  );
}
