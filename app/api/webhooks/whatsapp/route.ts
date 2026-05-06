/**
 * POST /api/webhooks/whatsapp
 *
 * Simulated WhatsApp Cloud API webhook receiver.
 * Mirrors the Meta WhatsApp Business Cloud API payload format.
 *
 * ── Simulated payload example ────────────────────────────────────────────────
 * {
 *   "object": "whatsapp_business_account",
 *   "entry": [{
 *     "id": "WA_BUSINESS_ACCOUNT_ID",
 *     "changes": [{
 *       "field": "messages",
 *       "value": {
 *         "messaging_product": "whatsapp",
 *         "metadata": { "phone_number_id": "PHONE_NUMBER_ID" },
 *         "contacts": [{ "profile": { "name": "João Silva" }, "wa_id": "5511999998888" }],
 *         "messages": [{
 *           "from": "5511999998888",
 *           "id": "wamid.HBgN...",
 *           "timestamp": "1715000000",
 *           "type": "text",
 *           "text": { "body": "Olá, preciso de um orçamento" }
 *         }]
 *       }
 *     }]
 *   }]
 * }
 *
 * ── Tenant routing (simulation only) ─────────────────────────────────────────
 * Pass ?tenantId=<UUID> in the query string.
 * In production, derive tenantId from the phone_number_id ↔ tenant mapping.
 *
 * ── Webhook verification (simulation only) ────────────────────────────────────
 * Meta sends a GET with hub.challenge for endpoint verification.
 * This handler also responds to GET for compatibility with testing tools.
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
    const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    // When env var is set, enforce token match; otherwise accept any (dev/sim)
    if (expectedToken && token !== expectedToken) {
      return NextResponse.json({ error: "Invalid verify token." }, { status: 403 });
    }
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "whatsapp-webhook-ready" });
}

// ── Payload schema ──────────────────────────────────────────────────────────
const textMessageSchema = z.object({
  from:      z.string(),
  id:        z.string(),
  timestamp: z.string(),
  type:      z.literal("text"),
  text:      z.object({ body: z.string() }),
});

const changeValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  contacts: z.array(z.object({
    profile: z.object({ name: z.string() }).optional(),
    wa_id:   z.string(),
  })).optional(),
  messages: z.array(textMessageSchema).optional(),
});

const waPayloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry:  z.array(z.object({
    id:      z.string(),
    changes: z.array(z.object({
      field: z.string(),
      value: changeValueSchema,
    })),
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
    const secret = getWebhookSecret("whatsapp");
    if (!secret) {
      return NextResponse.json({ error: "Webhook secret not configured." }, { status: 500 });
    }
    const sig = req.headers.get("x-hub-signature-256");
    if (!verifySignature(rawBody, sig, secret)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
  const parsed = waPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid WhatsApp payload.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const results = [];

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages" || !change.value.messages?.length) continue;

      const contacts = change.value.contacts ?? [];

      for (const waMsg of change.value.messages) {
        if (waMsg.type !== "text") continue; // only text for simulation

        const senderProfile = contacts.find((c) => c.wa_id === waMsg.from);
        const senderName    = senderProfile?.profile?.name;
        const timestamp     = new Date(parseInt(waMsg.timestamp, 10) * 1000);

        try {
          const result = await processInboundMessage({
            tenantId,
            channel:            "whatsapp",
            senderPhone:        waMsg.from,
            senderName,
            content:            waMsg.text.body,
            externalMessageId:  waMsg.id,
            timestamp,
          });
          results.push({ waMessageId: waMsg.id, ...result });
        } catch (err) {
          results.push({
            waMessageId: waMsg.id,
            error: err instanceof Error ? err.message : "processing error",
          });
        }
      }
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
