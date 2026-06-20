import type { RecommendedSkillSource } from "./skill-types";

export const recommendedSkillSources: RecommendedSkillSource[] = [
  {
    name: "Hermes bundled skills",
    sourceType: "official",
    purpose: ["planning", "github-pr-workflow", "document-analysis", "code-review"],
    usage: "Prefer bundled Hermes skills when available.",
    enabled: true
  },
  {
    name: "VoltAgent/awesome-agent-skills",
    sourceType: "curated-index",
    purpose: ["discover agent skills", "find production-proven skill references"],
    usage: "Use as a directory to find mature agent skills, not as blindly trusted executable code.",
    enabled: false
  },
  {
    name: "alirezarezvani/claude-skills",
    sourceType: "community-library",
    purpose: ["product", "engineering", "research", "compliance", "business operations"],
    usage: "Reference reusable skill structure and domain workflows after license and security review.",
    enabled: false
  },
  {
    name: "Jeffallan/claude-skills",
    sourceType: "community-library",
    purpose: ["full-stack development", "engineering workflows"],
    usage: "Reference development workflow skills.",
    enabled: false
  },
  {
    name: "Orchestra-Research/AI-Research-SKILLs",
    sourceType: "research-library",
    purpose: ["AI research", "technical research", "paper-oriented workflows"],
    usage: "Reference research workflow structure.",
    enabled: false
  },
  {
    name: "excalidraw/excalidraw",
    sourceType: "community-library",
    purpose: ["prototype wireframes", "screen-flow diagrams", "interview storyboard"],
    usage: "Reference fast whiteboard-style prototype patterns for the generated SVG and future interactive flows.",
    enabled: false
  },
  {
    name: "tldraw/tldraw",
    sourceType: "community-library",
    purpose: ["interactive canvas", "prototype editing", "visual collaboration"],
    usage: "Reference React canvas interaction patterns if the prototype view becomes editable.",
    enabled: false
  },
  {
    name: "gitbrent/PptxGenJS",
    sourceType: "community-library",
    purpose: ["PowerPoint generation", "finance-style pitch deck export"],
    usage: "Generate downloadable PPTX decks while keeping slide content auditable in markdown.",
    enabled: true
  },
  {
    name: "recharts/recharts",
    sourceType: "community-library",
    purpose: ["finance KPI charts", "risk dashboards", "decision metrics"],
    usage: "Reference chart composition for future PDRS, risk, and competitor dashboard visuals.",
    enabled: false
  }
];
