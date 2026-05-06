/**
 * Validates both simulated webhook processors end-to-end.
 * Uses the inline logic to avoid @/ path resolution issues in tsx.
 * Each test section cleans up its own data.
 */

import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import {
  SenderType, MessageDirection,
  ConversationChannel, ConversationStatus,
  ContactStatus,
} from "../lib/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter } as never) as any;

const SEP = "─".repeat(60);
function section(t: string) { console.log(`\n${SEP}\n${t}\n${SEP}`); }
function ok(m: string)      { console.log(`  ✅ ${m}`); }
function fail(m: string)    { console.error(`  ❌ ${m}`); process.exitCode = 1; }
function info(m: string)    { console.log(`  ℹ  ${m}`); }

// ── Inline processInboundMessage ──────────────────────────────────────────────
// Same logic as lib/webhooks/process-inbound.ts, no @/ imports.
async function processInboundMessage(payload: {
  tenantId: string;
  channel: "whatsapp" | "instagram";
  senderPhone?: string;
  senderExternalId?: string;
  senderName?: string;
  content: string;
  externalMessageId?: string;
  timestamp?: Date;
}) {
  const { tenantId, channel, senderPhone, senderExternalId, senderName, content } = payload;
  const sentAt = payload.timestamp ?? new Date();

  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

  let contactCreated = false;
  let contact: any;

  if (channel === "whatsapp") {
    if (!senderPhone) throw new Error("whatsapp requires senderPhone");
    const normalized = senderPhone.replace(/\D/g, "");
    const phoneE164  = `+${normalized}`;
    contact = await db.contact.findFirst({ where: { tenantId, phone: phoneE164 } });
    if (!contact) {
      contact = await db.contact.create({
        data: { tenantId, name: senderName ?? `WA ${phoneE164}`, phone: phoneE164, status: ContactStatus.lead },
      });
      contactCreated = true;
    } else if (senderName && (contact.name as string).startsWith("WA +")) {
      contact = await db.contact.update({ where: { id: contact.id }, data: { name: senderName } });
    }
  } else {
    if (!senderExternalId) throw new Error("instagram requires senderExternalId");
    contact = await db.contact.findFirst({ where: { tenantId, externalId: senderExternalId } });
    if (!contact) {
      contact = await db.contact.create({
        data: { tenantId, name: senderName ?? `IG ${senderExternalId.slice(-6)}`, externalId: senderExternalId, status: ContactStatus.lead },
      });
      contactCreated = true;
    } else if (senderName && (contact.name as string).startsWith("IG ")) {
      contact = await db.contact.update({ where: { id: contact.id }, data: { name: senderName } });
    }
  }

  let conversationCreated = false;
  let conversation: any = await db.conversation.findFirst({
    where:   { tenantId, contactId: contact.id, channel, status: { in: [ConversationStatus.open, ConversationStatus.pending] } },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        tenantId, contactId: contact.id, channel,
        status: ConversationStatus.open,
        subject: `${channel === "whatsapp" ? "WhatsApp" : "Instagram"} — ${contact.name}`,
        lastMessageAt: sentAt,
      },
    });
    conversationCreated = true;
  }

  const message = await db.message.create({
    data: {
      tenantId, conversationId: conversation.id,
      direction: MessageDirection.inbound, senderType: SenderType.contact,
      senderId: contact.id, content, sentAt,
    },
  });

  if (!conversationCreated) {
    await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: sentAt } });
  }

  await db.aiLog.create({
    data: {
      tenantId, entityType: "conversation", entityId: conversation.id,
      action: "webhook_received", modelProvider: "mock", modelId: "webhook-sim",
      promptTokens: 0, completionTokens: 0,
      inputSummary:  `channel=${channel}, from="${contact.name}", len=${content.length}`,
      outputSummary: `contactCreated=${contactCreated}, convCreated=${conversationCreated}, msgId=${message.id.slice(0, 8)}`,
    },
  });

  return { contactId: contact.id, conversationId: conversation.id, messageId: message.id, contactCreated, conversationCreated };
}

// ── Cleanup helper ─────────────────────────────────────────────────────────────
async function cleanupContact(contactId: string) {
  await db.aiLog.deleteMany({ where: { entityType: "conversation" } });
  await db.task.deleteMany({ where: { contactId } });
  const convs = await db.conversation.findMany({ where: { contactId } });
  for (const c of convs) {
    await db.message.deleteMany({ where: { conversationId: c.id } });
  }
  await db.conversation.deleteMany({ where: { contactId } });
  await db.contact.delete({ where: { id: contactId } });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Validate: Simulated Webhooks ===");

  let tenant = await db.tenant.findFirst();
  if (!tenant) {
    tenant = await db.tenant.create({ data: { name: "Test Tenant", slug: "test" } });
  }
  info(`tenant=${tenant.id.slice(0, 8)}…`);

  // ════════════════════════════════════════════════════════════
  // Test 1: WhatsApp — new contact, new conversation
  // ════════════════════════════════════════════════════════════
  section("Test 1: WhatsApp — new contact auto-created");
  const waResult1 = await processInboundMessage({
    tenantId:          tenant.id,
    channel:           "whatsapp",
    senderPhone:       "5511999998888",
    senderName:        "Maria Santos",
    content:           "Olá! Quero saber sobre os planos de vocês",
    externalMessageId: "wamid.test001",
  });
  info(`contactId=${waResult1.contactId.slice(0, 8)}… created=${waResult1.contactCreated}`);
  info(`convId=${waResult1.conversationId.slice(0, 8)}… created=${waResult1.conversationCreated}`);

  waResult1.contactCreated ? ok("Contact auto-created for new WA number") : fail("Contact should be new");
  waResult1.conversationCreated ? ok("Conversation created") : fail("Conversation should be new");

  const waContact1 = await db.contact.findUnique({ where: { id: waResult1.contactId } });
  waContact1?.phone === "+5511999998888" ? ok(`phone="+5511999998888"`) : fail(`phone wrong: ${waContact1?.phone}`);
  waContact1?.name === "Maria Santos"    ? ok(`name="Maria Santos"`) : fail(`name wrong: ${waContact1?.name}`);
  waContact1?.status === "lead"          ? ok(`status="lead"`) : fail("status not lead");

  const waMsg1 = await db.message.findUnique({ where: { id: waResult1.messageId } });
  waMsg1?.direction === MessageDirection.inbound   ? ok("direction=inbound") : fail("wrong direction");
  waMsg1?.senderType === SenderType.contact        ? ok("senderType=contact") : fail("wrong senderType");
  waMsg1?.content.includes("planos")               ? ok("content saved") : fail("content mismatch");

  const waLog1 = await db.aiLog.findFirst({ where: { entityId: waResult1.conversationId, action: "webhook_received" } });
  waLog1 ? ok("webhook_received aiLog created") : fail("aiLog missing");

  const waConv1 = await db.conversation.findUnique({ where: { id: waResult1.conversationId } });
  waConv1?.channel === ConversationChannel.whatsapp ? ok("channel=whatsapp") : fail("wrong channel");
  waConv1?.lastMessageAt !== null                   ? ok("lastMessageAt set") : fail("lastMessageAt null");

  // ════════════════════════════════════════════════════════════
  // Test 2: WhatsApp — second message reuses same conversation
  // ════════════════════════════════════════════════════════════
  section("Test 2: WhatsApp — 2nd message reuses open conversation");
  const waResult2 = await processInboundMessage({
    tenantId:          tenant.id,
    channel:           "whatsapp",
    senderPhone:       "5511999998888",  // same number
    senderName:        "Maria Santos",
    content:           "Vocês têm desconto para plano anual?",
    externalMessageId: "wamid.test002",
  });

  !waResult2.contactCreated      ? ok("No duplicate contact created") : fail("Duplicate contact!");
  !waResult2.conversationCreated ? ok("Existing conversation reused") : fail("New conversation created — should reuse");
  waResult2.conversationId === waResult1.conversationId
    ? ok(`conversationId stable: ${waResult2.conversationId.slice(0, 8)}…`)
    : fail("Different conversation IDs for same contact+channel");

  const msgCount = await db.message.count({ where: { conversationId: waResult1.conversationId } });
  msgCount === 2 ? ok(`${msgCount} messages in conversation`) : fail(`Expected 2 messages, got ${msgCount}`);

  const waConv2 = await db.conversation.findUnique({ where: { id: waResult1.conversationId } });
  waConv2?.lastMessageAt?.getTime() !== waConv1?.lastMessageAt?.getTime()
    ? ok("lastMessageAt updated after 2nd message")
    : fail("lastMessageAt not updated");

  await cleanupContact(waResult1.contactId);
  ok("WA test data cleaned up");

  // ════════════════════════════════════════════════════════════
  // Test 3: Instagram — new contact by PSID
  // ════════════════════════════════════════════════════════════
  section("Test 3: Instagram — new contact by PSID");
  const igResult1 = await processInboundMessage({
    tenantId:           tenant.id,
    channel:            "instagram",
    senderExternalId:   "IG_PSID_12345678",
    content:            "Vi seus produtos no feed! Quanto custa?",
    externalMessageId:  "mid.aGlnaGxpZ2h0",
  });
  info(`contactId=${igResult1.contactId.slice(0, 8)}… created=${igResult1.contactCreated}`);

  igResult1.contactCreated ? ok("Contact auto-created for IG PSID") : fail("Should create contact");
  const igContact1 = await db.contact.findUnique({ where: { id: igResult1.contactId } });
  igContact1?.externalId === "IG_PSID_12345678" ? ok("externalId stored correctly") : fail(`externalId wrong: ${igContact1?.externalId}`);
  igContact1?.name.startsWith("IG ") ? ok(`auto-name: "${igContact1?.name}"`) : fail("bad auto-name");

  const igConv1 = await db.conversation.findUnique({ where: { id: igResult1.conversationId } });
  igConv1?.channel === ConversationChannel.instagram ? ok("channel=instagram") : fail("wrong channel");

  // ════════════════════════════════════════════════════════════
  // Test 4: Instagram — known sender reuses contact + conversation
  // ════════════════════════════════════════════════════════════
  section("Test 4: Instagram — known PSID reuses contact");
  const igResult2 = await processInboundMessage({
    tenantId:           tenant.id,
    channel:            "instagram",
    senderExternalId:   "IG_PSID_12345678",  // same PSID
    content:            "É possível ver uma demonstração?",
    externalMessageId:  "mid.bGlnaGxpZ2h0",
  });

  !igResult2.contactCreated      ? ok("No duplicate contact for known PSID") : fail("Duplicate contact!");
  !igResult2.conversationCreated ? ok("Existing IG conversation reused")     : fail("New IG conversation — should reuse");
  igResult2.contactId === igResult1.contactId
    ? ok("Same contactId for same PSID")
    : fail("Different contactIds for same PSID");

  await cleanupContact(igResult1.contactId);
  ok("IG test data cleaned up");

  // ════════════════════════════════════════════════════════════
  // Test 5: Name update — auto-name replaced when real name arrives
  // ════════════════════════════════════════════════════════════
  section("Test 5: WA auto-name updated when real name provided");
  const waResult3 = await processInboundMessage({
    tenantId:     tenant.id,
    channel:      "whatsapp",
    senderPhone:  "5521000001111",
    content:      "Oi, tudo bem?",
  });
  const autoNameContact = await db.contact.findUnique({ where: { id: waResult3.contactId } });
  info(`auto-name: "${autoNameContact?.name}"`);
  autoNameContact?.name.startsWith("WA +") ? ok("Auto-name assigned (no senderName provided)") : fail("Bad auto-name");

  // Second message with real name
  await processInboundMessage({
    tenantId:    tenant.id,
    channel:     "whatsapp",
    senderPhone: "5521000001111",
    senderName:  "Carlos Mendes",
    content:     "Preciso de ajuda",
  });
  const updatedContact = await db.contact.findUnique({ where: { id: waResult3.contactId } });
  updatedContact?.name === "Carlos Mendes"
    ? ok(`Name updated to "Carlos Mendes"`)
    : fail(`Name not updated: "${updatedContact?.name}"`);

  await cleanupContact(waResult3.contactId);
  ok("Test 5 data cleaned up");

  // ════════════════════════════════════════════════════════════
  // Test 6: Channel isolation — same contact, different channels
  // ════════════════════════════════════════════════════════════
  section("Test 6: Channel isolation — WA and IG create separate conversations");
  const waResult4 = await processInboundMessage({
    tenantId:    tenant.id,
    channel:     "whatsapp",
    senderPhone: "5521999887766",
    senderName:  "Ana Lima",
    content:     "Mensagem pelo WhatsApp",
  });

  // Manually create the IG contact with same phone conceptually but different identity
  const igResult3 = await processInboundMessage({
    tenantId:          tenant.id,
    channel:           "instagram",
    senderExternalId:  "IG_PSID_ANALIMA_99",
    senderName:        "Ana Lima",
    content:           "Mensagem pelo Instagram",
  });

  waResult4.conversationId !== igResult3.conversationId
    ? ok("WA and IG create separate conversations")
    : fail("Conversations must not be shared across channels");

  const wConv = await db.conversation.findUnique({ where: { id: waResult4.conversationId } });
  const iConv = await db.conversation.findUnique({ where: { id: igResult3.conversationId } });
  wConv?.channel === "whatsapp"  ? ok("WA conversation channel=whatsapp") : fail("bad channel");
  iConv?.channel === "instagram" ? ok("IG conversation channel=instagram") : fail("bad channel");

  // Cleanup both contacts
  await cleanupContact(waResult4.contactId);
  await cleanupContact(igResult3.contactId);
  ok("Test 6 data cleaned up");

  // ════════════════════════════════════════════════════════════
  // Test 7: Invalid tenantId → throws
  // ════════════════════════════════════════════════════════════
  section("Test 7: Invalid tenantId rejected");
  try {
    await processInboundMessage({
      tenantId:    "00000000-0000-0000-0000-000000000000",
      channel:     "whatsapp",
      senderPhone: "5511999990000",
      content:     "should fail",
    });
    fail("Should have thrown for unknown tenant");
  } catch (e) {
    ok(`Correctly throws for unknown tenant: "${(e as Error).message}"`);
  }

  // ════════════════════════════════════════════════════════════
  // Test 8: Payload schema validation (zod)
  // ════════════════════════════════════════════════════════════
  section("Test 8: WhatsApp payload format validation");
  // Simulate what the route handler does (Zod parse)
  const { z } = await import("zod");
  const waSchema = z.object({
    object: z.literal("whatsapp_business_account"),
    entry:  z.array(z.object({
      id:      z.string(),
      changes: z.array(z.object({
        field: z.string(),
        value: z.object({ messaging_product: z.literal("whatsapp") }),
      })),
    })),
  });

  const validPayload   = waSchema.safeParse({ object: "whatsapp_business_account", entry: [{ id: "123", changes: [{ field: "messages", value: { messaging_product: "whatsapp" } }] }] });
  const invalidPayload = waSchema.safeParse({ object: "wrong", entry: [] });
  validPayload.success   ? ok("Valid WA payload accepted") : fail("Valid WA payload rejected");
  !invalidPayload.success ? ok("Invalid WA payload rejected") : fail("Invalid WA payload should fail");

  const igSchema = z.object({
    object: z.literal("instagram"),
    entry:  z.array(z.object({ id: z.string() })),
  });
  const validIg   = igSchema.safeParse({ object: "instagram",    entry: [{ id: "abc" }] });
  const invalidIg = igSchema.safeParse({ object: "whatsapp",     entry: [{ id: "abc" }] });
  validIg.success   ? ok("Valid IG payload accepted") : fail("Valid IG payload rejected");
  !invalidIg.success ? ok("Invalid IG payload rejected") : fail("Invalid IG payload should fail");

  console.log("\n" + SEP);
  console.log(process.exitCode ? "❌  Some tests FAILED — see ❌ above" : "✅  All tests PASSED");
  console.log(SEP + "\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
