export type SkillSourceType = "official" | "curated-index" | "community-library" | "research-library";

export type RecommendedSkillSource = {
  name: string;
  sourceType: SkillSourceType;
  purpose: string[];
  usage: string;
  enabled: boolean;
};
