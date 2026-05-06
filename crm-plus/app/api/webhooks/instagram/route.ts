/**
 * POST /api/webhooks/instagram
 *
 * Simulated Instagram Messaging API webhook receiver.
 * Mirrors the Meta Instagram Business Messaging payload format.
 *
 * ── Simulated payload example ────────────────────────────────────────────────
 * {
 *   "object": "instagram",
 *   "entry": [{
 *     "id": "IG_BUSINESS_ACCOUNT_ID",
 *     "messaging": [{
 *       "sender":    { "id": "IG_USER_PSID" },
 *       "recipient": { "id": "IG_BUSINESS_ACCOUNT_ID" },
 *       "timestamp": 1715000000,
 *       "message": {
 *         "mid":  "aGlnaGxpZ2h0...",
 *         "text": "Vi seus produtos no feed!"
 *       }
 *     }]
 *   }]
 * }
 *
 * ── Tenant routing (simulation only) ─────────────────────────────────────────
 * Pass ?tenantId=<UUID> in the query string.
 * In production, derive tenantId from recipient.id ↔ tenant mapping.
 *
 * ── Contact identification ────────────────────────────────────────────────────
 * Instagram uses page-scoped user IDs (PSID). Contacts are matched by
 * Contact.externalId = sender.id within the tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processInboundMessage } from "@/lib/webhooks/process-inbound";
import { isSignatureRequired, getWebhookSecret, verifySignature } from "@/lib/webhooks/verify-signature";
import { checkRateLimit, WEBHOOK_LIMIT } from "@/lib/rate-limit";

// ── Meta GET verification challenge ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge) {
    const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
    if (expectedToken && token !== expectedToken) {
      return NextResponse.json({ error: "Invalid verify token." }, { status: 403 });
    }
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "instagram-webhook-ready" });
}

// ── Payload schema ──────────────────────────────────────────────────────────
const igMessageSchema = z.object({
  mid:  z.string(),
  text: z.string().optional(),
});

const igMessagingEntrySchema = z.object({
  sender:    z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  timestamp: z.number(),
  message:   igMessageSchema,
});

const igPayloadSchema = z.object({
  object: z.literal("instagram"),
  entry:  z.array(z.object({
    id:        z.string(),
    messaging: z.array(igMessagingEntrySchema).optional(),
  })),
});

// ── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, WEBHOOK_LIMIT);
  if (limited) return limited;

  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenantId query param required (simulation mode)" },
      { status: 400 }
    );
  }

  // ── HMAC signature verification ────────────────────────────────────────────
  const rawBody = await req.text();

  if (isSignatureRequired()) {
    const secret = getWebhookSecret("instagram");
    if (!secret) {
      return NextResponse.json({ error: "Webhook secret not configured." }, { status: 500 });
    }
    const sig = req.headers.get("x-hub-signature-256");
    if (!verifySignature(rawBody, sig, secret)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
  const parsed = igPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Instagram payload.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const results = [];

  for (const entry of parsed.data.entry) {
    for (const event of entry.messaging ?? []) {
      // Ignore echo messages (sent by the business itself)
      if (!event.message.text) continue;

      const timestamp = new Date(event.timestamp * 1000);

      try {
        const result = await processInboundMessage({
          tenantId,
          channel:            "instagram",
          senderExternalId:   event.sender.id,
          content:            event.message.text,
          externalMessageId:  event.message.mid,
          timestamp,
        });
        results.push({ mid: event.message.mid, ...result });
      } catch (err) {
        results.push({
          mid:   event.message.mid,
          error: err instanceof Error ? err.message : "processing error",
        });
      }
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
