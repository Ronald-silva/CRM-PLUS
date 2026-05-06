import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { CompaniesClient } from "./companies-client";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "companies")) redirect("/dashboard");

  const params = await searchParams;
  const search = params.q ?? "";
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 20;

  const where = {
    tenantId: session.user.tenantId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { domain: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        domain: true,
        phone: true,
        address: true,
        createdAt: true,
        _count: { select: { contacts: true } },
      },
    }),
    prisma.company.count({ where }),
  ]);

  return (
    <CompaniesClient
      companies={companies}
      total={total}
      page={page}
      search={search}
      canCreate={can(session.user.role, "create", "companies")}
      canEdit={can(session.user.role, "update", "companies")}
      canDelete={can(session.user.role, "delete", "companies")}
    />
  );
}
