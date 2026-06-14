export type ModelConfig = {
  provider?: string;
  model?: string;
  usageMode?: string;
  codexCliCommand?: string | null;
};

type ChatMessage = { role: "system" | "user"; content: string };

function endpointFor(provider: string) {
  if (provider === "qwen") return process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
  if (provider === "openai") return process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions";
  return process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions";
}

function keyFor(provider: string) {
  if (provider === "qwen") return process.env.DASHSCOPE_API_KEY;
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  return process.env.DEEPSEEK_API_KEY;
}

function defaultModel(provider: string) {
  if (provider === "qwen") return "qwen-plus";
  if (provider === "openai") return "gpt-4.1-mini";
  return "deepseek-chat";
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型输出未包含 JSON 对象。");
  return candidate.slice(start, end + 1);
}

export async function generateJsonWithModel<T>({
  system,
  user,
  config,
  fallback
}: {
  system: string;
  user: string;
  config?: ModelConfig;
  fallback: T;
}): Promise<T> {
  if (config?.usageMode === "codex-cli") return fallback;

  const provider = (config?.provider || process.env.HERMES_INFERENCE_PROVIDER || "deepseek").toLowerCase();
  const apiKey = keyFor(provider);
  if (!apiKey) return fallback;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user }
  ];

  try {
    const response = await fetch(endpointFor(provider), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config?.model || process.env.HERMES_INFERENCE_MODEL || defaultModel(provider),
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) return fallback;
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return fallback;
    return JSON.parse(extractJson(content)) as T;
  } catch {
    return fallback;
  }
}
