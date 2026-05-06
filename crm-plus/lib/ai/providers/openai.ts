import type { AIProvider, AIOptions } from "../index";

// Stub — implement when AI_PROVIDER=openai
export const openaiProvider: AIProvider = {
  async complete(_prompt: string, _options?: AIOptions): Promise<string> {
    throw new Error("OpenAI provider not yet implemented. Set AI_PROVIDER=claude.");
  },
};
