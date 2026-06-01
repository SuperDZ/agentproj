# SpecFlow Agent

Before AI writes code, make sure the product is worth building.

SpecFlow Agent is a local-first demo product for AI Coding product decisions. Users enter a product idea, run Hermes Agent Runtime or Mock Hermes Runtime research, review competitors, generate a differentiated PRD, pass a local PDRS scoring gate, and export a structured Codex-ready task pack.

## Core Flow

```text
Idea Intake
→ Hermes Research Run
→ Competitor Matrix
→ Differentiation Evaluation
→ PRD Generation
→ PDRS Evaluation Gate
→ Codex Pack Export
→ Lightweight Monitor Plan
```

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- SQLite for local development
- Hermes adapter with real/mock mode
- Shared project-flow service for Server Actions and API routes
- Zod JSON schema validation
- Vitest unit tests

## Local Run

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Open <http://localhost:3000> and click **Start New Project** or **View Demo Project**. The intake form persists financial suitability, monitoring preference, and preferred tech stack so Hermes mock output, scoring, and Codex Pack exports reflect the project context.

## Tests

```bash
npm test
```

## Environment

```env
DATABASE_URL="file:./dev.db"
HERMES_MODE="mock"
HERMES_API_BASE_URL=""
HERMES_API_KEY=""
```

Set `HERMES_MODE=real` and `HERMES_API_BASE_URL` to route calls through the Hermes adapter. If no real server exists, mock mode supports the full demo. Codex Pack exports can be copied as one bundle or downloaded file-by-file from the workspace.

## Code Review Notes

- 最新中文代码审查报告见 [`docs/reviews/2026-06-01-code-review.md`](docs/reviews/2026-06-01-code-review.md)。
- 当前最重要的后续事项：提交 lockfile、跑通 CI/测试、补充 `project-flow` service 关键路径测试，并进一步适配 real Hermes output endpoint。

## Safety Boundaries

1. Third-party skills are reference documents only and are not executed automatically.
2. Hermes real mode is called only through `src/lib/hermes/client.ts`.
3. Raw Hermes output is persisted for audit.
4. Parsed Hermes output is validated by Zod schemas.
5. PDRS scoring is computed by the local rule engine.
6. Financial product outputs must not promise returns, principal protection, certainty, or no-risk outcomes.
7. Hermes terminal, browser, and file tools require approval and container isolation before future enablement.
