import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { ensureDefaultPipeline } from "@/lib/db/ensure-default-pipeline";
import { PipelineClient } from "./pipeline-client";

export default async function PipelinePage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "pipelines")) redirect("/dashboard");

  await ensureDefaultPipeline(session.user.tenantId);

  const pipelines = await prisma.pipeline.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      isDefault: true,
      createdAt: true,
      stages: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, order: true, probability: true },
      },
    },
  });

  return (
    <PipelineClient
      pipelines={pipelines}
      canCreate={can(session.user.role, "create", "pipelines")}
      canEdit={can(session.user.role, "update", "pipelines")}
      canDelete={can(session.user.role, "delete", "pipelines")}
    />
  );
}
