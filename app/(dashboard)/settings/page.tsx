import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "settings")) redirect("/dashboard");

  const tenantId = session.user.tenantId;

  const [tenant, users] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, plan: true, status: true, createdAt: true },
    }),
    can(session.user.role, "read", "team")
      ? prisma.user.findMany({
          where:   { tenantId },
          orderBy: [{ role: "asc" }, { name: "asc" }],
          select:  {
            id: true, name: true, email: true, phone: true,
            role: true, isActive: true, lastLoginAt: true, createdAt: true,
          },
        })
      : [],
  ]);

  if (!tenant) redirect("/dashboard");

  return (
    <SettingsClient
      tenant={{ ...tenant, createdAt: tenant.createdAt.toISOString() }}
      users={users.map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt:   u.createdAt.toISOString(),
      }))}
      currentUserId={session.user.id}
      canUpdateSettings={can(session.user.role, "update", "settings")}
      canReadTeam={can(session.user.role, "read", "team")}
      canCreateTeam={can(session.user.role, "create", "team")}
      canUpdateTeam={can(session.user.role, "update", "team")}
      canDeleteTeam={can(session.user.role, "delete", "team")}
    />
  );
}
