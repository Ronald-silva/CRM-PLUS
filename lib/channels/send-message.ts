import { sendWhatsAppMessage } from "./whatsapp";
import { sendInstagramMessage } from "./instagram";

export interface OutboundPayload {
  channel:        "whatsapp" | "instagram" | "manual" | "email";
  content:        string;
  recipientPhone?: string;   // E.164 — required for whatsapp
  recipientPsid?:  string;   // Instagram PSID — required for instagram
}

export interface ChannelSendResult {
  externalId:     string | null;
  externalStatus: string;  // sent | failed | simulated | skipped
  deliveryError?: string;
}

export async function sendChannelMessage(
  payload: OutboundPayload
): Promise<ChannelSendResult> {
  const { channel, content } = payload;

  if (channel === "whatsapp") {
    if (!payload.recipientPhone) {
      return { externalId: null, externalStatus: "failed", deliveryError: "recipientPhone required for whatsapp" };
    }
    return sendWhatsAppMessage(payload.recipientPhone, content);
  }

  if (channel === "instagram") {
    if (!payload.recipientPsid) {
      return { externalId: null, externalStatus: "failed", deliveryError: "recipientPsid required for instagram" };
    }
    return sendInstagramMessage(payload.recipientPsid, content);
  }

  // manual / email / unknown — no external send
  return { externalId: null, externalStatus: "skipped" };
}
