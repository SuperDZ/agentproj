export const modelProviderOptions = [
  { value: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat" },
  { value: "qwen", label: "Qwen / DashScope", defaultModel: "qwen-plus" },
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4.1-mini" },
  { value: "moonshot", label: "Moonshot / Kimi", defaultModel: "moonshot-v1-8k" },
  { value: "zhipu", label: "Zhipu GLM", defaultModel: "glm-4-flash" },
  { value: "siliconflow", label: "SiliconFlow", defaultModel: "Qwen/Qwen2.5-72B-Instruct" },
  { value: "openrouter", label: "OpenRouter", defaultModel: "openai/gpt-4.1-mini" },
  { value: "volcengine", label: "Volcengine Ark", defaultModel: "doubao-seed-1-6-250615" },
  { value: "custom", label: "Custom OpenAI-compatible", defaultModel: "custom-model" }
] as const;

export type ModelProvider = typeof modelProviderOptions[number]["value"];

export const modelProviderValues = modelProviderOptions.map((provider) => provider.value) as [ModelProvider, ...ModelProvider[]];

export function isModelProvider(value: unknown): value is ModelProvider {
  return typeof value === "string" && modelProviderOptions.some((provider) => provider.value === value);
}

export function defaultModelForProvider(provider: string) {
  return modelProviderOptions.find((item) => item.value === provider)?.defaultModel ?? "deepseek-chat";
}
