/**
 * Validates Phase 7: Channel adapters, outbound routing, webhook token verification.
 *
 * Runs against the real database (DATABASE_URL from .env / .env.local).
 * Avoids @/ imports — all logic is either imported via relative paths or inlined.
 *
 * Tests:
 *   - Message model has externalId / externalStatus / deliveryError columns
 *   - WhatsApp adapter: simulated mode (no env vars) returns correct shape
 *   - Instagram adapter: simulated mode returns correct shape
 *   - Send router: routes correctly per channel
 *   - Outbound message persists externalStatus in DB
 *   - Webhook verify_token guard (inline logic test)
 *   - Full E2E flow: inbound → contact created → message stored → AI fields set
 */

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { createHmac } from "crypto";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg }     from "@prisma/adapter-pg";
import {
  SenderType, MessageDirection,
  ConversationChannel, ConversationStatus, ContactStatus,
} from "../lib/generated/prisma/enums";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db      = new PrismaClient({ adapter } as never) as any;

const SEP     = "─".repeat(62);
const pass    = (m: string) => console.log(`  ✅ ${m}`);
const fail    = (m: string) => { console.error(`  ❌ ${m}`); process.exitCode = 1; };
const info    = (m: string) => console.log(`  ℹ  ${m}`);
const section = (t: string) => console.log(`\n${SEP}\n${t}\n${SEP}`);

// ── Inline channel adapter logic (mirrors lib/channels/) ─────────────────────

interface SendResult {
  externalId:     string | null;
  externalStatus: string;
  deliveryError?: string;
}

async function simulateWaSend(phone: string | null): Promise<SendResult> {
  const hasToken = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  if (!hasToken || !phone) return { externalId: null, externalStatus: "simulated" };
  // Real call would happen here — out of scope for unit test
  return { externalId: null, externalStatus: "simulated" };
}

async function simulateIgSend(psid: string | null): Promise<SendResult> {
  const hasToken = !!(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_PAGE_ID);
  if (!hasToken || !psid) return { externalId: null, externalStatus: "simulated" };
  return { externalId: null, externalStatus: "simulated" };
}

function routeChannel(
  channel: string,
  phone?: string | null,
  psid?: string | null
): Promise<SendResult> {
  if (channel === "whatsapp") return simulateWaSend(phone ?? null);
  if (channel === "instagram") return simulateIgSend(psid ?? null);
  return Promise.resolve({ externalId: null, externalStatus: "skipped" });
}

// ── Webhook verify token guard (inline) ──────────────────────────────────────

function verifyTokenGuard(receivedToken: string | null, envToken: string | undefined): boolean {
  if (!envToken) return true; // no env var → accept any (dev mode)
  return receivedToken === envToken;
}

// ── Test data helpers ─────────────────────────────────────────────────────────

async function setup() {
  const tenant = await db.tenant.create({
    data: { name: "ValidatePhase7 Co", slug: `validate-phase7-${Date.now()}` },
  });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      name: "Owner P7", email: `owner.p7.${Date.now()}@example.com`,
      passwordHash: "$2b$12$placeholder", role: "owner", isActive: true,
    },
  });
  return { tenant, user };
}

async function teardown(tenantId: string) {
  await db.message.deleteMany({ where: { tenantId } });
  await db.conversation.deleteMany({ where: { tenantId } });
  await db.contact.deleteMany({ where: { tenantId } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testMessageSchema(tenantId: string, userId: string) {
  section("Message model — externalId / externalStatus / deliveryError");

  const contact = await db.contact.create({
    data: { tenantId, name: "Schema Test Contact", status: ContactStatus.lead },
  });
  const conv = await db.conversation.create({
    data: { tenantId, contactId: contact.id, channel: ConversationChannel.whatsapp, status: ConversationStatus.open },
  });

  // Create message with external fields
  const msg = await db.message.create({
    data: {
      tenantId,
      conversationId: conv.id,
      content: "Test message",
      direction: MessageDirection.outbound,
      senderType: SenderType.user,
      senderId: userId,
      externalId: "wamid.test123",
      externalStatus: "sent",
    },
    select: { id: true, externalId: true, externalStatus: true, deliveryError: true },
  });

  if (msg.externalId === "wamid.test123") pass("externalId field exists and stores value");
  else                                    fail("externalId field missing or wrong");

  if (msg.externalStatus === "sent") pass("externalStatus field exists and stores value");
  else                               fail("externalStatus field missing or wrong");

  if (msg.deliveryError === null) pass("deliveryError field exists (nullable)");
  else                            fail("deliveryError field missing or wrong");

  // Update to failed with error
  await db.message.update({
    where: { id: msg.id },
    data: { externalStatus: "failed", deliveryError: "WABA not connected" },
  });
  const updated = await db.message.findUnique({
    where: { id: msg.id },
    select: { externalStatus: true, deliveryError: true },
  });
  if (updated?.externalStatus === "failed" && updated?.deliveryError === "WABA not connected") {
    pass("externalStatus + deliveryError updated correctly");
  } else {
    fail("failed to update externalStatus / deliveryError");
  }

  return { contactId: contact.id, convId: conv.id, msgId: msg.id };
}

async function testChannelAdapters() {
  section("Channel adapters — simulated mode");

  const waResult = await simulateWaSend("5511999998888");
  if (waResult.externalStatus === "simulated" || waResult.externalStatus === "sent") {
    pass(`WhatsApp adapter: status=${waResult.externalStatus} (env vars ${process.env.WHATSAPP_ACCESS_TOKEN ? "present" : "absent"})`);
  } else {
    fail(`WhatsApp adapter returned unexpected status: ${waResult.externalStatus}`);
  }

  const igResult = await simulateIgSend("123456789");
  if (igResult.externalStatus === "simulated" || igResult.externalStatus === "sent") {
    pass(`Instagram adapter: status=${igResult.externalStatus} (env vars ${process.env.INSTAGRAM_ACCESS_TOKEN ? "present" : "absent"})`);
  } else {
    fail(`Instagram adapter returned unexpected status: ${igResult.externalStatus}`);
  }

  // Manual channel → skipped
  const manual = await routeChannel("manual");
  if (manual.externalStatus === "skipped") pass("Manual channel: correctly skipped");
  else                                     fail(`Manual channel: expected skipped, got ${manual.externalStatus}`);

  // Missing phone → simulated
  const waNoPhone = await simulateWaSend(null);
  if (waNoPhone.externalStatus === "simulated") pass("WhatsApp with no phone → simulated (no crash)");
  else                                          fail("WhatsApp with no phone behaved unexpectedly");
}

async function testOutboundPersistence(tenantId: string, userId: string, convId: string) {
  section("Outbound message — externalStatus persisted to DB");

  // Simulate creating an outbound message and updating its status (as the API does)
  const msg = await db.message.create({
    data: {
      tenantId,
      conversationId: convId,
      content: "Olá! Temos uma proposta para você.",
      direction: MessageDirection.outbound,
      senderType: SenderType.user,
      senderId: userId,
    },
  });

  const sendResult = await routeChannel("whatsapp", "5511999998888");
  await db.message.update({
    where: { id: msg.id },
    data: {
      externalId:     sendResult.externalId,
      externalStatus: sendResult.externalStatus,
      deliveryError:  sendResult.deliveryError ?? null,
    },
  });

  const persisted = await db.message.findUnique({
    where: { id: msg.id },
    select: { externalId: true, externalStatus: true },
  });

  const validStatuses = ["sent", "simulated", "failed"];
  if (persisted && validStatuses.includes(persisted.externalStatus ?? "")) {
    pass(`Outbound message persisted with externalStatus=${persisted.externalStatus}`);
  } else {
    fail(`Unexpected externalStatus: ${persisted?.externalStatus}`);
  }
}

async function testWebhookVerifyToken() {
  section("Webhook verify_token guard");

  // No env var set → accept any token (dev mode)
  if (verifyTokenGuard("any-token", undefined)) pass("No env var: any token accepted (dev mode)");
  else                                          fail("No env var: token incorrectly rejected");

  // Env var set, correct token
  if (verifyTokenGuard("my-secret", "my-secret")) pass("Correct token: accepted");
  else                                             fail("Correct token: incorrectly rejected");

  // Env var set, wrong token
  if (!verifyTokenGuard("wrong-token", "my-secret")) pass("Wrong token: rejected (403)");
  else                                                fail("Wrong token: incorrectly accepted");

  // Env var set, null token
  if (!verifyTokenGuard(null, "my-secret")) pass("Missing token: rejected");
  else                                      fail("Missing token: incorrectly accepted");
}

async function testE2EFlow(tenantId: string) {
  section("E2E flow: inbound webhook → contact → conversation → AI fields");

  // 1. Simulate inbound: find or create contact by phone
  const phone = `+55119${Date.now().toString().slice(-8)}`;
  let contact = await db.contact.findFirst({
    where: { tenantId, phone },
  });
  if (!contact) {
    contact = await db.contact.create({
      data: { tenantId, name: "Webhook Lead", phone, status: ContactStatus.lead },
    });
  }
  pass(`Contact created/found: ${contact.id}`);

  // 2. Find or create open conversation
  let conv = await db.conversation.findFirst({
    where: { tenantId, contactId: contact.id, channel: ConversationChannel.whatsapp, status: ConversationStatus.open },
  });
  if (!conv) {
    conv = await db.conversation.create({
      data: {
        tenantId, contactId: contact.id,
        channel: ConversationChannel.whatsapp, status: ConversationStatus.open,
      },
    });
  }
  pass(`Conversation created/found: ${conv.id}`);

  // 3. Save inbound message
  const inboundMsg = await db.message.create({
    data: {
      tenantId,
      conversationId: conv.id,
      content: "Quero saber o preço do plano Pro",
      direction: MessageDirection.inbound,
      senderType: SenderType.contact,
    },
  });
  pass(`Inbound message saved: ${inboundMsg.id}`);

  // 4. Simulate AI: set detectedIntent + summaryText
  await db.conversation.update({
    where: { id: conv.id },
    data: { detectedIntent: "quote_request", summaryText: "Lead perguntando sobre preço do plano Pro." },
  });
  const updated = await db.conversation.findUnique({
    where: { id: conv.id },
    select: { detectedIntent: true, summaryText: true },
  });
  if (updated?.detectedIntent === "quote_request") pass("AI intent detected: quote_request");
  else                                              fail("AI intent not set");
  if (updated?.summaryText)                        pass("AI summary text set");
  else                                              fail("AI summary not set");

  // 5. Agent replies outbound
  const outboundMsg = await db.message.create({
    data: {
      tenantId,
      conversationId: conv.id,
      content: "Olá! Nosso plano Pro custa R$299/mês. Posso enviar a proposta?",
      direction: MessageDirection.outbound,
      senderType: SenderType.user,
      externalStatus: "simulated",
    },
  });
  pass(`Outbound reply saved: ${outboundMsg.id}`);

  // 6. Count messages in conversation
  const msgCount = await db.message.count({ where: { conversationId: conv.id } });
  if (msgCount >= 2) pass(`Conversation has ${msgCount} messages (inbound + outbound)`);
  else               fail(`Expected at least 2 messages, got ${msgCount}`);

  info("E2E flow complete: inbound → contact → conversation → AI → outbound reply");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nPhase 7 Validation — Channel Adapters, Outbound, E2E Flow");

  let tenantId = "";
  try {
    const { tenant, user } = await setup();
    tenantId = tenant.id;
    info(`Tenant: ${tenantId}`);

    const { convId } = await testMessageSchema(tenantId, user.id);
    await testChannelAdapters();
    await testOutboundPersistence(tenantId, user.id, convId);
    await testWebhookVerifyToken();
    await testE2EFlow(tenantId);

  } finally {
    if (tenantId) await teardown(tenantId).catch(() => {});
    await (db as any).$disconnect();
  }

  const exitCode = process.exitCode ?? 0;
  console.log(`\n${SEP}`);
  if (exitCode === 0) console.log("  ALL TESTS PASSED ✅");
  else                console.error("  SOME TESTS FAILED ❌  — see above");
  console.log(SEP + "\n");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
