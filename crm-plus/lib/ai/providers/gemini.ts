import type { AIProvider, AIOptions } from "../index";

// Stub — implement when AI_PROVIDER=gemini
export const geminiProvider: AIProvider = {
  async complete(_prompt: string, _options?: AIOptions): Promise<string> {
    throw new Error("Gemini provider not yet implemented. Set AI_PROVIDER=claude.");
  },
};
