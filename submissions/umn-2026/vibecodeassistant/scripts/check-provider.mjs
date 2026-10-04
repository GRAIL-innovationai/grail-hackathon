import nextEnv from "@next/env";
import OpenAI from "openai";
nextEnv.loadEnvConfig(process.cwd());
const router = process.env.AI_PROVIDER === "openrouter" || (process.env.AI_PROVIDER !== "openai" && !!process.env.OPENROUTER_API_KEY);
const apiKey = router
  ? process.env.OPENROUTER_API_KEY
  : process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log("AI key is not configured.");
  process.exit(1);
}
try {
  const client = new OpenAI({
    apiKey,
    baseURL: router ? "https://openrouter.ai/api/v1" : undefined,
    timeout: 20000,
    maxRetries: 0,
  });
  const result = await client.chat.completions.create({
    model: router
      ? process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini"
      : process.env.OPENAI_MODEL || "gpt-4.1-mini",
    messages: [{ role: "user", content: 'Reply with {"ok":true}.' }],
    max_tokens: 50,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "provider_check",
        strict: true,
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed = JSON.parse(result.choices[0]?.message.content || "null");
  if (parsed?.ok !== true) throw new Error("Invalid structured response.");
  console.log(
    `Provider verified: ${router ? "OpenRouter" : "OpenAI"} returned valid structured JSON. Model: ${result.model}`,
  );
} catch (error) {
  console.log(
    `Provider check failed. HTTP status: ${error.status || "unavailable"}; code: ${error.code || "connection_or_response_error"}.`,
  );
  process.exitCode = 1;
}
