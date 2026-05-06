/**
 * WhatsApp Business Cloud API — outbound message adapter.
 *
 * Uses Meta Graph API v21.0.
 * Requires: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 *
 * When env vars are absent → returns externalStatus="simulated" (no real send).
 * Never throws — always returns a SendResult.
 */

const WA_API_VERSION = "v21.0";
const WA_API_BASE    = "https://graph.facebook.com";

export interface WhatsAppConfig {
  accessToken:   string;
  phoneNumberId: string;
}

export interface WASendResult {
  externalId:     string | null;
  externalStatus: "sent" | "failed" | "simulated";
  deliveryError?: string;
}

function getConfig(): WhatsAppConfig | null {
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}

/**
 * Sends a text message via WhatsApp Cloud API.
 * @param to  Recipient phone in E.164 format (e.g. "5511999998888")
 * @param text Message body
 */
export async function sendWhatsAppMessage(
  to:   string,
  text: string
): Promise<WASendResult> {
  const cfg = getConfig();

  if (!cfg) {
    return { externalId: null, externalStatus: "simulated" };
  }

  const url = `${WA_API_BASE}/${WA_API_VERSION}/${cfg.phoneNumberId}/messages`;

  try {
    const res  = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${cfg.accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      const err = (json.error as Record<string, unknown> | undefined);
      const msg = typeof err?.message === "string" ? err.message : `HTTP ${res.status}`;
      return { externalId: null, externalStatus: "failed", deliveryError: msg };
    }

    const messages = json.messages as Array<{ id: string }> | undefined;
    const wamId    = messages?.[0]?.id ?? null;
    return { externalId: wamId, externalStatus: "sent" };

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "network error";
    return { externalId: null, externalStatus: "failed", deliveryError: msg };
  }
}
