import type { CreateResearchRunInput, HermesEvent, HermesRunResult } from "./types";

export function createMockHermesOutput(input: CreateResearchRunInput) {
  const financialGuardrail = input.financialSuitability
    ? " Include suitability checks, risk profiling, explainability, and never promise returns."
    : " Keep compliance and safety boundaries explicit.";

  return {
    query_keywords: [input.idea, input.industry, input.targetUser, "AI coding product decision", "competitor research agent"],
    summary:
      `Hermes mock research found that ${input.idea} should avoid becoming a generic AI app builder. The stronger wedge is a decision-and-handoff workflow for ${input.targetUser} in ${input.industry}.${financialGuardrail}`,
    competitors: [
      {
        name: "Bolt / Lovable class tools",
        type: "commercial" as const,
        url: "https://bolt.new",
        description: "Prompt-to-app builders that rapidly create full-stack prototypes from natural language.",
        core_features: ["natural language app generation", "instant preview", "deployment workflow"],
        strengths: ["fast demo creation", "low setup cost", "broad audience"],
        weaknesses: ["weak product strategy gate", "limited competitor awareness", "can encourage duplicate products"],
        reusable_ideas: ["fast onboarding", "visible build steps", "artifact handoff"],
        threat_level: 82,
        reuse_strategy: "reference_only" as const
      },
      {
        name: "v0 / Figma Make class tools",
        type: "commercial" as const,
        url: "https://v0.dev",
        description: "UI-first generation systems for turning prompts or designs into interface code.",
        core_features: ["UI generation", "component iteration", "design-to-code handoff"],
        strengths: ["excellent UI iteration", "component quality", "designer-friendly"],
        weaknesses: ["does not validate market need", "PRD depth varies", "limited product moat analysis"],
        reusable_ideas: ["artifact preview", "componentized output", "copyable code blocks"],
        threat_level: 74,
        reuse_strategy: "reference_only" as const
      },
      {
        name: "Productboard / Aha! class tools",
        type: "commercial" as const,
        url: "https://www.productboard.com",
        description: "Product management suites for feedback, roadmaps, prioritization, and stakeholder alignment.",
        core_features: ["roadmapping", "feedback repository", "prioritization scoring"],
        strengths: ["mature PM workflows", "enterprise collaboration", "traceability"],
        weaknesses: ["not AI coding-native", "heavyweight setup", "limited Codex handoff"],
        reusable_ideas: ["scored decision records", "roadmap artifacts", "stakeholder-friendly reports"],
        threat_level: 68,
        reuse_strategy: "reference_only" as const
      },
      {
        name: "PostHog / Amplitude class tools",
        type: "commercial" as const,
        url: "https://posthog.com",
        description: "Product analytics and experimentation platforms for measuring behavior and feature outcomes.",
        core_features: ["event analytics", "funnels", "feature flags", "experiments"],
        strengths: ["strong product telemetry", "iteration loops", "team dashboards"],
        weaknesses: ["post-launch focus", "not designed for pre-build product decisioning", "requires instrumentation"],
        reusable_ideas: ["monitoring metrics", "drift dashboards", "iteration triggers"],
        threat_level: 55,
        reuse_strategy: "reference_only" as const
      },
      {
        name: "LangSmith / Braintrust class tools",
        type: "commercial" as const,
        url: "https://www.langchain.com/langsmith",
        description: "LLM evaluation and observability platforms for prompts, traces, datasets, and regressions.",
        core_features: ["LLM traces", "eval datasets", "regression monitoring", "human review"],
        strengths: ["strong eval workflow", "observability", "quality gates"],
        weaknesses: ["agent/product strategy is not core", "not competitor matrix focused", "technical user bias"],
        reusable_ideas: ["quality gates", "evaluation reasons", "audit trails"],
        threat_level: 61,
        reuse_strategy: "reference_only" as const
      },
      {
        name: "Hermes Agent",
        type: "open_source" as const,
        url: "https://github.com/NousResearch/hermes-agent",
        description: "Agent runtime with skills, memory, self-improvement, tool use, and scheduled tasks.",
        core_features: ["skills runtime", "progressive disclosure", "memory", "scheduled jobs"],
        strengths: ["runtime flexibility", "skill reuse", "local-first potential"],
        weaknesses: ["API surface may evolve", "requires adapter boundary", "not a PM product by itself"],
        reusable_ideas: ["skills catalog", "monitor jobs", "research agents"],
        threat_level: 49,
        reuse_strategy: "reuse" as const
      },
      {
        name: "GitHub Spec Kit",
        type: "open_source" as const,
        url: "https://github.com/github/spec-kit",
        description: "Specification-driven development workflow that turns product intent into implementation-ready tasks.",
        core_features: ["specification templates", "task generation", "development workflow alignment"],
        strengths: ["developer-friendly", "spec-first discipline", "pairs well with coding agents"],
        weaknesses: ["not competitor-aware by default", "does not run market research", "needs upstream decision gate"],
        reusable_ideas: ["spec templates", "task phases", "acceptance criteria"],
        threat_level: 58,
        reuse_strategy: "reference_only" as const
      }
    ],
    differentiation: {
      redundancy_risk: 64,
      differentiation_score: 86,
      should_build:
        "Do not build another generic AI app builder. Build a competitive-research-aware product decision and Codex handoff agent.",
      mvp_reframe:
        `A SpecFlow workspace that turns ${input.targetUser}'s idea into a competitor-aware PRD, local PDRS gate, and Codex-ready task package before code generation begins.`,
      must_have_features: [
        "Hermes-backed research run with mock fallback",
        "competitor matrix and reuse strategy",
        "local PDRS scoring with reasons",
        "editable PRD and structured Codex Pack export",
        "monitor plan for competitor drift"
      ],
      should_not_build_features: [
        "generic prompt-to-app code generation",
        "unreviewed third-party skill execution",
        "financial return promises or no-risk claims",
        "full analytics or A/B testing replacement"
      ],
      reuse_strategy: [
        "Use Hermes as the controlled runtime boundary",
        "Use third-party skills as reference documents only",
        "Borrow spec-first handoff structure without claiming integration"
      ]
    },
    prd: {
      product_goal: `Help ${input.targetUser} decide whether ${input.idea} is worth building before handing work to Codex.`,
      target_users: input.targetUser,
      industry: input.industry,
      non_goals: ["full app generator", "automatic third-party skill execution", "financial advice automation"]
    },
    codex_pack_seed: {
      stack: input.preferredTechStack || "Next.js, TypeScript, Prisma, SQLite, Tailwind CSS",
      pages: ["home", "new project", "project workspace", "export pack"],
      run_commands: ["npm install", "cp .env.example .env", "npx prisma migrate dev", "npm run dev", "npm test"]
    },
    monitor_plan: {
      what_to_monitor: ["new AI app builders", "spec-first agent tools", "Hermes API changes", "skill ecosystem maturity"],
      metrics: ["new competitor count", "feature overlap", "threat level delta", "differentiation drift score"],
      competitor_drift_signals: ["competitor adds PRD export", "competitor adds research agent", "Hermes changes skill API"],
      hermes_cron_suggestion: "Run weekly competitor scan and monthly deep-dive skill catalog review.",
      suggested_schedule: "0 9 * * 1",
      next_iteration_actions: ["refresh matrix", "recompute PDRS", "update Codex Pack", "review security boundaries"]
    }
  };
}

export async function createMockResearchRun(input: CreateResearchRunInput): Promise<HermesRunResult> {
  const parsedOutput = createMockHermesOutput(input);
  return {
    hermesRunId: `mock_${Date.now()}`,
    mode: "mock",
    status: "completed",
    rawOutput: JSON.stringify(parsedOutput, null, 2),
    parsedOutput
  };
}

export function getMockEvents(runId: string): HermesEvent[] {
  return [
    { id: `${runId}-1`, at: new Date().toISOString(), level: "info", message: "Loaded reference skill catalog." },
    { id: `${runId}-2`, at: new Date().toISOString(), level: "info", message: "Generated mock competitor matrix." },
    { id: `${runId}-3`, at: new Date().toISOString(), level: "info", message: "Validated research output schema." }
  ];
}
