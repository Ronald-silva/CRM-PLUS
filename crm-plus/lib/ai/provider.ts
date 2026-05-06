/**
 * Thin AI completion wrapper used by the action files.
 *
 * Provider resolution order:
 *   1. AI_PROVIDER=mock → always mock (for tests / CI)
 *   2. ANTHROPIC_API_KEY present → Anthropic Claude
 *   3. No key → throw "ai-disabled" (caller must fall back to mock)
 *
 * Model: claude-haiku-4-5-20251001 by default (fast + low cost for CRM
 * high-frequency calls). Override with AI_MODEL env var when higher quality
 * is needed (e.g. AI_MODEL=claude-sonnet-4-6).
 *
 * Estimated cost with Haiku:
 *   ~$0.00025/1K input tokens, ~$0.00125/1K output tokens
 *   A typical 10-message CRM conversation ≈ $0.0003 per call
 */

import Anthropic from "@anthropic-ai/sdk";

export interface AICompletionOptions {
  system:    string;
  user:      string;
  maxTokens?: number;
}

export interface AICompletionResult {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
  provider:     string;
  modelId:      string;
}

const DEFAULT_MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5-20251001";

function isEnabled(): boolean {
  if (process.env.AI_PROVIDER === "mock") return false;
  return !!process.env.ANTHROPIC_API_KEY;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  _client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _client;
}

/**
 * Run an AI completion. Throws on failure — callers must catch and fall back
 * to their mock implementation.
 *
 * Throws "ai-disabled" when AI_PROVIDER=mock or no API key is configured.
 */
export async function aiComplete(
  options: AICompletionOptions
): Promise<AICompletionResult> {
  if (!isEnabled()) throw new Error("ai-disabled");

  const modelId = DEFAULT_MODEL;
  const response = await getClient().messages.create({
    model:      modelId,
    max_tokens: options.maxTokens ?? 512,
    system:     options.system,
    messages:   [{ role: "user", content: options.user }],
  });

  const text = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  return {
    text,
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    provider:     "anthropic",
    modelId,
  };
}

/**
 * Parse JSON from an AI response, stripping optional markdown code fences.
 * Throws SyntaxError on invalid JSON — callers should fall back to mock.
 */
export function parseAIJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
