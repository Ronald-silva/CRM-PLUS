/**
 * Instagram Messaging API — outbound message adapter.
 *
 * Uses Meta Graph API v21.0.
 * Requires: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_PAGE_ID
 *
 * When env vars are absent → returns externalStatus="simulated" (no real send).
 * Never throws — always returns a SendResult.
 */

const IG_API_VERSION = "v21.0";
const IG_API_BASE    = "https://graph.facebook.com";

export interface InstagramConfig {
  accessToken: string;
  pageId:      string;
}

export interface IGSendResult {
  externalId:     string | null;
  externalStatus: "sent" | "failed" | "simulated";
  deliveryError?: string;
}

function getConfig(): InstagramConfig | null {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const pageId      = process.env.INSTAGRAM_PAGE_ID;
  if (!accessToken || !pageId) return null;
  return { accessToken, pageId };
}

/**
 * Sends a text message via Instagram Messaging API.
 * @param recipientPsid  Page-Scoped User ID of the recipient
 * @param text           Message body
 */
export async function sendInstagramMessage(
  recipientPsid: string,
  text:          string
): Promise<IGSendResult> {
  const cfg = getConfig();

  if (!cfg) {
    return { externalId: null, externalStatus: "simulated" };
  }

  const url = `${IG_API_BASE}/${IG_API_VERSION}/${cfg.pageId}/messages`;

  try {
    const res  = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${cfg.accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        message:   { text },
      }),
    });

    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      const err = (json.error as Record<string, unknown> | undefined);
      const msg = typeof err?.message === "string" ? err.message : `HTTP ${res.status}`;
      return { externalId: null, externalStatus: "failed", deliveryError: msg };
    }

    const msgId = typeof json.message_id === "string" ? json.message_id : null;
    return { externalId: msgId, externalStatus: "sent" };

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "network error";
    return { externalId: null, externalStatus: "failed", deliveryError: msg };
  }
}
