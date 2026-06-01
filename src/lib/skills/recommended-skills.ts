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
  }
];
