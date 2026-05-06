import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "contacts")) redirect("/dashboard");

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
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [contacts, total, allTags] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      },
    }),
    prisma.contact.count({ where }),
    prisma.tag.findMany({
      where: { tenantId: session.user.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const contactsWithTags = contacts.map((c) => ({
    ...c,
    tags: c.tags.map((ct) => ct.tag),
  }));

  return (
    <ContactsClient
      contacts={contactsWithTags}
      allTags={allTags}
      total={total}
      page={page}
      search={search}
      canCreate={can(session.user.role, "create", "contacts")}
      canEdit={can(session.user.role, "update", "contacts")}
      canDelete={can(session.user.role, "delete", "contacts")}
    />
  );
}
