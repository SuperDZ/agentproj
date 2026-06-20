import { recordModelInvocation } from "@/lib/observability";

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
  fallback,
  projectId,
  traceId
}: {
  system: string;
  user: string;
  config?: ModelConfig;
  fallback: T;
  projectId?: string;
  traceId?: string;
}): Promise<T> {
  if (config?.usageMode === "codex-cli") return fallback;

  const provider = (config?.provider || process.env.HERMES_INFERENCE_PROVIDER || "deepseek").toLowerCase();
  const model = config?.model || process.env.HERMES_INFERENCE_MODEL || defaultModel(provider);
  const startedAt = Date.now();
  const apiKey = keyFor(provider);
  if (!apiKey) {
    await recordModelInvocation({
      provider,
      model,
      latencyMs: Date.now() - startedAt,
      status: "fallback",
      projectId,
      traceId,
      error: "Missing API key."
    });
    return fallback;
  }

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
        model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      await recordModelInvocation({
        provider,
        model,
        latencyMs: Date.now() - startedAt,
        status: "fallback",
        projectId,
        traceId,
        error: `HTTP ${response.status}`
      });
      return fallback;
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    await recordModelInvocation({
      provider,
      model,
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
      estimatedCostUsd: null,
      latencyMs: Date.now() - startedAt,
      status: content ? "ok" : "fallback",
      projectId,
      traceId
    });
    if (!content) return fallback;
    return JSON.parse(extractJson(content)) as T;
  } catch (error) {
    await recordModelInvocation({
      provider,
      model,
      latencyMs: Date.now() - startedAt,
      status: "fallback",
      projectId,
      traceId,
      error: error instanceof Error ? error.message : String(error)
    });
    return fallback;
  }
}
