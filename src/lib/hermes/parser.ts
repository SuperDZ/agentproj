import { hermesResearchOutputSchema, type HermesResearchOutput } from "./types";

function numberFromValue(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(100, Math.round(parsed)));
  }
  return fallback;
}

function stringFromValue(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) return value.map((item) => String(item)).join("; ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "建议建设，但必须保留人工复核和合规边界。" : "不建议在当前边界下建设。";
  return fallback;
}

function arrayFromValue(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n|[,;，；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return fallback;
}

function competitorTypeFromValue(value: unknown) {
  const candidate = String(value || "alternative");
  if (candidate === "open_source" || candidate === "commercial" || candidate === "internal_tool" || candidate === "alternative") return candidate;
  return "alternative";
}

function reuseStrategyFromValue(value: unknown) {
  const candidate = String(value || "unknown");
  if (candidate === "reuse" || candidate === "fork" || candidate === "reference_only" || candidate === "avoid" || candidate === "unknown") return candidate;
  return "unknown";
}

function normalizeHermesResearchOutput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const output = { ...(value as Record<string, unknown>) };
  output.query_keywords = arrayFromValue(output.query_keywords, []);
  output.summary = stringFromValue(output.summary, "Hermes research completed.");

  if (Array.isArray(output.competitors)) {
    output.competitors = output.competitors.map((item) => {
      const competitor = item && typeof item === "object" && !Array.isArray(item) ? { ...(item as Record<string, unknown>) } : {};
      return {
        name: stringFromValue(competitor.name, "Unknown competitor"),
        type: competitorTypeFromValue(competitor.type),
        url: stringFromValue(competitor.url, "https://example.com"),
        description: stringFromValue(competitor.description, ""),
        core_features: arrayFromValue(competitor.core_features ?? competitor.coreFeatures, []),
        strengths: arrayFromValue(competitor.strengths, []),
        weaknesses: arrayFromValue(competitor.weaknesses, []),
        reusable_ideas: arrayFromValue(competitor.reusable_ideas ?? competitor.reusableIdeas, []),
        threat_level: numberFromValue(competitor.threat_level ?? competitor.threatLevel, 50),
        reuse_strategy: reuseStrategyFromValue(competitor.reuse_strategy ?? competitor.reuseStrategy)
      };
    });
  }

  if (output.differentiation && typeof output.differentiation === "object" && !Array.isArray(output.differentiation)) {
    const differentiation = { ...(output.differentiation as Record<string, unknown>) };
    differentiation.redundancy_risk = numberFromValue(differentiation.redundancy_risk, 50);
    differentiation.differentiation_score = numberFromValue(differentiation.differentiation_score, 50);
    differentiation.should_build = stringFromValue(differentiation.should_build, "建议分阶段验证后建设。");
    differentiation.mvp_reframe = stringFromValue(differentiation.mvp_reframe, "围绕可验证的 MVP（最小可行产品）重新界定范围。");
    differentiation.must_have_features = arrayFromValue(differentiation.must_have_features, []);
    differentiation.should_not_build_features = arrayFromValue(differentiation.should_not_build_features, []);
    differentiation.reuse_strategy = arrayFromValue(differentiation.reuse_strategy, ["reference_only"]);
    output.differentiation = differentiation;
  }

  if (output.monitor_plan && typeof output.monitor_plan === "object" && !Array.isArray(output.monitor_plan)) {
    const monitorPlan = { ...(output.monitor_plan as Record<string, unknown>) };
    monitorPlan.what_to_monitor = arrayFromValue(monitorPlan.what_to_monitor, []);
    monitorPlan.metrics = arrayFromValue(monitorPlan.metrics, []);
    monitorPlan.competitor_drift_signals = arrayFromValue(monitorPlan.competitor_drift_signals, []);
    monitorPlan.hermes_cron_suggestion = stringFromValue(monitorPlan.hermes_cron_suggestion, "每周运行一次竞品扫描。");
    monitorPlan.suggested_schedule = stringFromValue(monitorPlan.suggested_schedule, "0 9 * * 1");
    monitorPlan.next_iteration_actions = arrayFromValue(monitorPlan.next_iteration_actions, []);
    output.monitor_plan = monitorPlan;
  }

  return output;
}

export function parseHermesResearchOutput(raw: string | unknown): HermesResearchOutput {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return hermesResearchOutputSchema.parse(normalizeHermesResearchOutput(value));
}
