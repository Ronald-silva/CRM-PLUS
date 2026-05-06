import { NextResponse } from "next/server";
import { seedDemo, DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await seedDemo();
    return NextResponse.json({ ok: true, email: DEMO_EMAIL, password: DEMO_PASSWORD, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
