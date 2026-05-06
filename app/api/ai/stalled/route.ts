import { NextResponse } from "next/server";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import { detectStalledLeads } from "@/lib/ai/actions/detect-stalled-leads";

// GET /api/ai/stalled — detect stalled leads and auto-create tasks
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "opportunities")) return forbidden();

  const stalled = await detectStalledLeads(session.tenantId, session.id);

  return NextResponse.json({
    data: stalled,
    meta: {
      total: stalled.length,
      tasksCreated: stalled.filter((s) => s.taskCreated).length,
    },
  });
}
