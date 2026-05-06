import { NextRequest, NextResponse } from "next/server";

interface Entry { timestamps: number[] }

const store = new Map<string, Entry>();

export interface RateLimitConfig {
  /** Route prefix included in the key to isolate quotas between routes. */
  prefix:    string;
  windowMs:  number;
  max:       number;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() ?? "unknown";
}

/** Returns a 429 NextResponse, or null if the request is within quota. */
export function checkRateLimit(req: NextRequest, config: RateLimitConfig): NextResponse | null {
  const key    = `${config.prefix}:${clientIp(req)}`;
  const now    = Date.now();
  const cutoff = now - config.windowMs;

  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.max) {
    store.set(key, entry);
    const resetAt = entry.timestamps[0] + config.windowMs;
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em breve." },
      {
        status:  429,
        headers: { "Retry-After": String(Math.ceil((resetAt - now) / 1000)) },
      }
    );
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return null;
}

// ── Pre-configured limiters ───────────────────────────────────────────────────

/** 60 requests / 60 s — webhook ingestion (per IP) */
export const WEBHOOK_LIMIT: RateLimitConfig = {
  prefix:   "webhook",
  windowMs: 60_000,
  max:      60,
};

/** 5 requests / 60 s — account registration (per IP) */
export const REGISTER_LIMIT: RateLimitConfig = {
  prefix:   "register",
  windowMs: 60_000,
  max:      5,
};
