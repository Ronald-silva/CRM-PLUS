/**
 * Shared inbound-message processor for simulated webhooks.
 *
 * Tenant routing: callers must supply `tenantId` extracted from the request
 * (query param `?tenantId=` for simulation; production would derive it from
 * a webhook secret or phone_number_id mapping).
 *
 * Idempotency note: production would store `externalMessageId` (wamid / mid)
 * on the Message row to reject duplicates. Omitted here as this is a simulation.
 */

import { prisma } from "@/lib/db/client";
import { summarizeConversation } from "@/lib/ai/actions/summarize-conversation";
import { detectIntent }           from "@/lib/ai/actions/detect-intent";
import { suggestNextAction }      from "@/lib/ai/actions/suggest-next-action";

export interface InboundPayload {
  tenantId:           string;
  channel:            "whatsapp" | "instagram";
  senderPhone?:       string;      // WhatsApp: E.164 digits, e.g. "5511999998888"
  senderExternalId?:  string;      // Instagram: page-scoped user ID (PSID)
  senderName?:        string;
  content:            string;
  externalMessageId?: string;      // wamid / mid — logged, not stored yet
  timestamp?:         Date;
}

export interface InboundResult {
  contactId:           string;
  conversationId:      string;
  messageId:           string;
  contactCreated:      boolean;
  conversationCreated: boolean;
  intent?:             string;
}

export async function processInboundMessage(
  payload: InboundPayload
): Promise<InboundResult> {
  const { tenantId, channel, senderPhone, senderExternalId, senderName, content } = payload;
  const sentAt = payload.timestamp ?? new Date();

  // ── 1. Verify tenant ────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

  // ── 2. Find or create contact ────────────────────────────────────────────────
  let contactCreated = false;
  let contact;

  if (channel === "whatsapp") {
    if (!senderPhone) throw new Error("whatsapp channel requires senderPhone");
    const normalized = senderPhone.replace(/\D/g, "");
    const phoneE164  = `+${normalized}`;

    contact = await prisma.contact.findFirst({
      where: { tenantId, phone: phoneE164 },
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: { tenantId, name: senderName ?? `WA ${phoneE164}`, phone: phoneE164, status: "lead" },
      });
      contactCreated = true;
    } else if (senderName && contact.name.startsWith("WA +")) {
      // Update auto-generated name once we have the real name
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data:  { name: senderName },
      });
    }
  } else {
    if (!senderExternalId) throw new Error("instagram channel requires senderExternalId");

    contact = await prisma.contact.findFirst({
      where: { tenantId, externalId: senderExternalId },
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          tenantId,
          name:       senderName ?? `IG ${senderExternalId.slice(-6)}`,
          externalId: senderExternalId,
          status:     "lead",
        },
      });
      contactCreated = true;
    } else if (senderName && contact.name.startsWith("IG ")) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data:  { name: senderName },
      });
    }
  }

  // ── 3. Find or create open conversation ─────────────────────────────────────
  let conversationCreated = false;
  let conversation = await prisma.conversation.findFirst({
    where:   { tenantId, contactId: contact.id, channel, status: { in: ["open", "pending"] } },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    const channelLabel = channel === "whatsapp" ? "WhatsApp" : "Instagram";
    conversation = await prisma.conversation.create({
      data: {
        tenantId,
        contactId:     contact.id,
        channel,
        status:        "open",
        subject:       `${channelLabel} — ${contact.name}`,
        lastMessageAt: sentAt,
      },
    });
    conversationCreated = true;
  }

  // ── 4. Save message ─────────────────────────────────────────────────────────
  const message = await prisma.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      direction:      "inbound",
      senderType:     "contact",
      senderId:       contact.id,
      content,
      sentAt,
    },
  });

  // ── 5. Update conversation.lastMessageAt ────────────────────────────────────
  if (!conversationCreated) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data:  { lastMessageAt: sentAt },
    });
  }

  // ── 6. Log webhook receipt ──────────────────────────────────────────────────
  await prisma.aiLog.create({
    data: {
      tenantId,
      entityType:       "conversation",
      entityId:         conversation.id,
      action:           "webhook_received",
      modelProvider:    "mock",
      modelId:          "webhook-sim",
      promptTokens:     0,
      completionTokens: 0,
      inputSummary:  `channel=${channel}, from="${contact.name}", len=${content.length}, extMsgId=${payload.externalMessageId ?? "n/a"}`,
      outputSummary: `contactCreated=${contactCreated}, convCreated=${conversationCreated}, msgId=${message.id.slice(0, 8)}`,
    },
  });

  // ── 7. AI pipeline (fire-and-forget) ─────────────────────────────────────────
  const convId = conversation.id;
  Promise.all([
    summarizeConversation({ conversationId: convId, tenantId }),

    detectIntent({ conversationId: convId, tenantId, contactId: contact.id })
      .then(async (intentResult) => {
        // Run suggestNextAction when a buying signal is detected and the contact
        // has an open opportunity — complements the task detectIntent auto-creates.
        if (
          intentResult.intent === "interest" ||
          intentResult.intent === "quote_request"
        ) {
          const opp = await prisma.opportunity.findFirst({
            where:   { tenantId, contactId: contact.id, status: "open" },
            include: { stage: true },
          });
          if (opp) {
            const daysSince = Math.floor(
              (Date.now() - opp.updatedAt.getTime()) / 86_400_000
            );
            await suggestNextAction({
              tenantId,
              contactId:            contact.id,
              opportunityId:        opp.id,
              opportunityStatus:    opp.status,
              stageName:            opp.stage?.name,
              daysSinceLastContact: daysSince,
            });
          }
        }
      }),
  ]).catch(() => {});

  return {
    contactId:           contact.id,
    conversationId:      conversation.id,
    messageId:           message.id,
    contactCreated,
    conversationCreated,
  };
}
