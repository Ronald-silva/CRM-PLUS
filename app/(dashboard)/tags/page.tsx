import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { TagsClient } from "./tags-client";

export default async function TagsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "tags")) redirect("/dashboard");

  const tags = await prisma.tag.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      createdAt: true,
      _count: { select: { contacts: true } },
    },
  });

  return (
    <TagsClient
      tags={tags}
      canCreate={can(session.user.role, "create", "tags")}
      canEdit={can(session.user.role, "update", "tags")}
      canDelete={can(session.user.role, "delete", "tags")}
    />
  );
}
