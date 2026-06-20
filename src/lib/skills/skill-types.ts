export type SkillSourceType = "official" | "curated-index" | "community-library" | "research-library";

export type SkillKind = "skill" | "tool";

export type RecommendedSkillSource = {
  name: string;
  kind?: SkillKind;
  sourceType: SkillSourceType;
  purpose: string[];
  usage: string;
  enabled: boolean;
};

export type SkillSafetyStatus = "passed" | "unreviewed" | "failed";

export type SkillSearchSafety = {
  status: SkillSafetyStatus;
  label: string;
  reasons: string[];
};

export type SkillWhitelistEntry = {
  name: string;
  url?: string;
  cloneUrl?: string;
  kind: SkillKind;
  addedAt: string;
};

export type SkillSearchResult = {
  kind: SkillKind;
  name: string;
  description?: string;
  stars?: number;
  url?: string;
  cloneUrl?: string;
  updatedAt?: string;
  whitelisted: boolean;
  safety: SkillSearchSafety;
};

export type SkillInventoryItem = {
  kind: SkillKind;
  name: string;
  path: string;
  descriptionZh: string;
  category?: string;
  source: "recommended" | "installed" | "optional" | "imported" | "custom" | "tool";
  safety: SkillSearchSafety;
  whitelisted: boolean;
  url?: string;
  cloneUrl?: string;
  stars?: number;
  updatedAt?: string;
  enabled?: boolean;
  purpose?: string[];
};

export type SkillInventoryResponse = {
  recommendedSkills: SkillInventoryItem[];
  recommendedTools: SkillInventoryItem[];
  installedSkills: SkillInventoryItem[];
  installedTools: SkillInventoryItem[];
};
