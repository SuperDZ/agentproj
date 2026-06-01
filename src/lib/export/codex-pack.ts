import type { EvaluationResult } from "@/lib/evaluation/engine";
import type { HermesResearchOutput } from "@/lib/hermes/types";

export type PackProject = {
  name: string;
  idea: string;
  industry: string;
  targetUser: string;
  preferredTechStack?: string | null;
};

export type CodexPackFile = { filename: string; content: string };

function list(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function generatePrdMarkdown(project: PackProject, research?: HermesResearchOutput) {
  const d = research?.differentiation;
  return `# PRD: ${project.name}

## 1. Product Goal
${research?.prd.product_goal ?? `Before AI writes code, decide whether ${project.idea} is worth building.`}

## 2. Target Users
${project.targetUser}

## 3. Core Pain Points
- Teams jump from idea to code before checking competitors.
- Generic AI builders create redundant products.
- Codex handoffs often lack PRD, API, acceptance criteria, and safety boundaries.

## 4. Competitor Findings
${research ? research.competitors.map((c) => `- **${c.name}** (${c.type}): ${c.description}`).join("\n") : "- Run Hermes Research to populate competitor findings."}

## 5. Differentiated MVP
${d?.mvp_reframe ?? "A competitor-research-aware decision gate and Codex handoff workspace."}

## 6. Core Features
${list(d?.must_have_features ?? ["Idea intake", "Hermes Research", "Competitor Matrix", "PDRS", "Codex Pack", "Monitor Plan"])}

## 7. User Stories
- As a founder or PM, I can enter a product idea and receive competitor-aware framing.
- As an AI coding user, I can export a Codex-ready task pack after PDRS review.
- As a reviewer, I can audit raw Hermes output and local scoring reasons.

## 8. Acceptance Criteria
- A project can be created locally.
- Mock Hermes Research works without external services.
- At least seven competitors appear in the matrix.
- PDRS includes sub-scores and reasons.
- Codex Pack exports multiple structured files.

## 9. Data Models
Project, ResearchRun, Competitor, Evaluation, GeneratedArtifact, MonitorJob, MonitorReport.

## 10. API Contracts
POST /api/projects, GET /api/projects/:id, POST /api/projects/:id/research, GET /api/projects/:id/competitors, POST /api/projects/:id/evaluate, POST /api/projects/:id/generate-prd, POST /api/projects/:id/export, POST /api/projects/:id/monitor-job.

## 11. Non-goals
${list(d?.should_not_build_features ?? ["Do not build another generic AI app builder.", "Do not execute unreviewed third-party skills."])}

## 12. Risks
- Competitive overlap with app builders and PM suites.
- Hermes real API endpoints may change, so all calls must stay behind the adapter.
- Financial products must avoid promises of return, principal protection, certainty, or no risk.
`;
}

export function generateMonitorPlan(project: PackProject, research?: HermesResearchOutput) {
  const plan = research?.monitor_plan;
  return `# Monitor Plan: ${project.name}

## What to monitor
${list(plan?.what_to_monitor ?? ["competitor launches", "AI coding workflow changes", "Hermes runtime changes"])}

## Metrics
${list(plan?.metrics ?? ["feature overlap", "threat level", "differentiation drift score"])}

## Competitor drift signals
${list(plan?.competitor_drift_signals ?? ["competitor adds PRD export", "competitor adds research workflow"])}

## Hermes cron suggestion
${plan?.hermes_cron_suggestion ?? "Run a weekly mock or real Hermes scan."}

## Suggested schedule
${plan?.suggested_schedule ?? "0 9 * * 1"}

## Next iteration actions
${list(plan?.next_iteration_actions ?? ["refresh matrix", "recompute PDRS", "revise Codex Pack"])}
`;
}

export function generateCodexPack(project: PackProject, research: HermesResearchOutput | undefined, evaluation: EvaluationResult, prdMarkdown?: string): CodexPackFile[] {
  const prd = prdMarkdown || generatePrdMarkdown(project, research);
  const techStack = project.preferredTechStack || "Next.js App Router, TypeScript, Tailwind CSS, Prisma, SQLite, Hermes Adapter, Vitest";
  const competitorReport = `# Competitor Report\n\n${research?.competitors.map((c) => `## ${c.name}\n- Type: ${c.type}\n- URL: ${c.url}\n- Threat: ${c.threat_level}\n- Reuse Strategy: ${c.reuse_strategy}\n- Core Features: ${c.core_features.join(", ")}\n- Strengths: ${c.strengths.join(", ")}\n- Weaknesses: ${c.weaknesses.join(", ")}`).join("\n\n") ?? "Run research first."}`;
  const evaluationReport = `# Evaluation Report

- PDRS: ${evaluation.pdrs}
- Decision: ${evaluation.decision}
- Redundancy Risk: ${evaluation.redundancyRisk}
- Differentiation Score: ${evaluation.differentiationScore}

## Sub-scores and Reasons

### Opportunity Score: ${evaluation.opportunityScore.score}
${list(evaluation.opportunityScore.reasons)}

### Competitive Score: ${evaluation.competitiveScore.score}
${list(evaluation.competitiveScore.reasons)}

### Specification Score: ${evaluation.specificationScore.score}
${list(evaluation.specificationScore.reasons)}

### Prototype Score: ${evaluation.prototypeScore.score}
${list(evaluation.prototypeScore.reasons)}

### Prompt Readiness Score: ${evaluation.promptReadinessScore.score}
${list(evaluation.promptReadinessScore.reasons)}

## Risks
${list(evaluation.risks)}

## Next Actions
${list(evaluation.nextActions)}`;
  const apiSpec = `# API Spec\n\n- POST /api/projects\n- GET /api/projects/:id\n- POST /api/projects/:id/research\n- GET /api/projects/:id/competitors\n- POST /api/projects/:id/evaluate\n- POST /api/projects/:id/generate-prd\n- POST /api/projects/:id/export\n- POST /api/projects/:id/monitor-job\n`;
  const tasks = `# Tasks\n\n## Phase 1: Scaffold\n- Create Next.js app shell and Tailwind layout.\n\n## Phase 2: Data Models\n- Add Prisma models and migrations.\n\n## Phase 3: Core UI\n- Build project intake and workspace steps.\n\n## Phase 4: Hermes Adapter\n- Implement real/mock adapter, parser, and audit storage.\n\n## Phase 5: Evaluation Engine\n- Add local PDRS scoring with explainable reasons.\n\n## Phase 6: Export Pack\n- Generate README, PRD, reports, API spec, tasks, prompt, and monitor plan.\n\n## Phase 7: Monitoring Plan\n- Provide Hermes cron suggestion and drift signals.\n\n## Phase 8: Tests and Polish\n- Add unit tests, migration check, and demo flow validation.\n`;
  const codexPrompt = `# Codex Prompt\n\n## Product Goal\n${project.idea}\n\n## Differentiated Positioning\n${research?.differentiation.should_build ?? "Build a competitive-research-aware product decision and Codex handoff agent."}\n\n## Competitor Findings\n${research?.competitors.map((c) => `- ${c.name}: ${c.description}`).join("\n") ?? "See competitor_report.md"}\n\n## Non-goals\n- Do not build another generic AI app builder.\n- Do not automatically execute third-party skills.\n- Do not promise guaranteed financial returns, principal protection, or no-risk outcomes.\n\n## Tech Stack\n${techStack}.\n\n## Pages\nHome, New Project, Project Workspace, Hermes Research, Competitor Matrix, Differentiation, PRD, PDRS, Codex Pack, Monitor Plan.\n\n## Data Models\nProject, ResearchRun, Competitor, Evaluation, GeneratedArtifact, MonitorJob, MonitorReport.\n\n## API Contracts\n${apiSpec}\n\n## Tasks\n${tasks}\n\n## Acceptance Criteria\n- Local mock mode demo runs without Hermes API.\n- PDRS gate is computed locally and explained.\n- Codex Pack is structured as multiple files.\n\n## Run Commands\n- npm install\n- cp .env.example .env\n- npx prisma migrate dev\n- npm run dev\n- npm test\n\n## Testing Plan\nUnit test evaluation engine, mock Hermes adapter, Codex Pack generator, and Prisma migration.\n\n## Security Boundaries\n- Third-party skills are references only.\n- Hermes real mode is only called through adapter.\n- Raw output is saved for audit and parsed output is schema-validated.\n- Terminal/browser/file tools require approval and isolation.\n`;
  const readme = `# ${project.name}\n\n${project.idea}\n\n## Run Commands\n\`\`\`bash\nnpm install\ncp .env.example .env\nnpx prisma migrate dev\nnpm run dev\nnpm test\n\`\`\`\n`;
  return [
    { filename: "README.md", content: readme },
    { filename: "PRD.md", content: prd },
    { filename: "competitor_report.md", content: competitorReport },
    { filename: "evaluation_report.md", content: evaluationReport },
    { filename: "api_spec.md", content: apiSpec },
    { filename: "tasks.md", content: tasks },
    { filename: "codex_prompt.md", content: codexPrompt },
    { filename: "monitor_plan.md", content: generateMonitorPlan(project, research) }
  ];
}

export function packToClipboardText(files: CodexPackFile[]) {
  return files.map((file) => `===== ${file.filename} =====\n${file.content}`).join("\n\n");
}
