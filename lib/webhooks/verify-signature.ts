import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies a Meta webhook HMAC-SHA256 signature.
 *
 * Header format: X-Hub-Signature-256: sha256=<hex-digest>
 *
 * Only active when WEBHOOK_SIGNATURE_REQUIRED=true.
 * Secret resolved per channel: WHATSAPP_WEBHOOK_SECRET / INSTAGRAM_WEBHOOK_SECRET,
 * falling back to WEBHOOK_SECRET.
 */

export type WebhookChannel = "whatsapp" | "instagram";

export function isSignatureRequired(): boolean {
  return process.env.WEBHOOK_SIGNATURE_REQUIRED === "true";
}

export function getWebhookSecret(channel: WebhookChannel): string | undefined {
  if (channel === "whatsapp") {
    return process.env.WHATSAPP_WEBHOOK_SECRET ?? process.env.WEBHOOK_SECRET;
  }
  return process.env.INSTAGRAM_WEBHOOK_SECRET ?? process.env.WEBHOOK_SECRET;
}

export function verifySignature(
  rawBody:         string,
  signatureHeader: string | null,
  secret:          string
): boolean {
  if (!signatureHeader) return false;

  const eqIdx = signatureHeader.indexOf("=");
  if (eqIdx < 0) return false;

  const algo = signatureHeader.slice(0, eqIdx);
  const sig  = signatureHeader.slice(eqIdx + 1);
  if (algo !== "sha256" || !sig) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
