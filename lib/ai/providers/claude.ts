import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AIOptions } from "../index";

const MODEL = process.env.AI_MODEL ?? "claude-sonnet-4-6";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const claudeProvider: AIProvider = {
  async complete(prompt: string, options: AIOptions = {}): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: prompt },
    ];

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: options.maxTokens ?? 1024,
      system: options.systemPrompt,
      messages,
    });

    const block = response.content[0];
    if (block.type !== "text") return "";
    return block.text;
  },
};
