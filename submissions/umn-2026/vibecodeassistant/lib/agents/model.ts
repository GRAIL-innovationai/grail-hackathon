import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { providerConfig } from "./provider";
export async function modelCall<T extends z.ZodTypeAny>(
  schema: T,
  name: string,
  prompt: string,
  payload: unknown,
  options: { timeoutMs?: number } = {},
): Promise<z.infer<T>> {
  const config = providerConfig();
  if (!config.apiKey) throw new Error("AI provider API key is not configured.");
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: options.timeoutMs || 20000,
    maxRetries: 0,
  });
  for (let attempt = 0; attempt < 2; attempt++)
    try {
      const response = await client.chat.completions.parse({
        model: config.model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(payload) },
        ],
        response_format: zodResponseFormat(schema, name),
      });
      return schema.parse(response.choices[0]?.message.parsed);
    } catch {
      if (attempt === 1)
        throw new Error(
          "Model request or structured output failed after one retry.",
        );
    }
  throw new Error("Model request failed.");
}
