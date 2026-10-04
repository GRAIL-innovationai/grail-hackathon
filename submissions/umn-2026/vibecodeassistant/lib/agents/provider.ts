export function providerConfig() {
  const router =
    process.env.AI_PROVIDER === "openrouter" ||
    (process.env.AI_PROVIDER !== "openai" && !!process.env.OPENROUTER_API_KEY);
  return {
    name: router ? "OpenRouter" : "OpenAI",
    apiKey: router
      ? process.env.OPENROUTER_API_KEY
      : process.env.OPENAI_API_KEY,
    baseURL: router ? "https://openrouter.ai/api/v1" : undefined,
    model: router
      ? process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini"
      : process.env.OPENAI_MODEL || "gpt-4.1-mini",
  };
}
export function hasModelCredentials() {
  return !!providerConfig().apiKey;
}
