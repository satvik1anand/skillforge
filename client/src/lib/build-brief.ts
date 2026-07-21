export const buildContextPacks = [
  "software_product",
  "business_venture",
  "marketing_growth",
  "operations_process",
] as const;

export type BuildContextPack = (typeof buildContextPacks)[number];

export const contextPackLabels: Record<BuildContextPack, string> = {
  software_product: "Software product",
  business_venture: "Business / venture",
  marketing_growth: "Growth / marketing",
  operations_process: "Operations / process",
};

/** The small, display-safe subset used by the workspace list. */
export type BuildBrief = {
  id: string;
  title: string;
  outcome: string;
  status: string;
  primaryContextPack: BuildContextPack;
  updatedAt: string;
};

type SkillSuggestionRule = {
  skill: string;
  terms: readonly string[];
};

type ContextSkillSuggestions = {
  fallbackSkills: readonly [string, string, string];
  refinementRules: readonly SkillSuggestionRule[];
};

export type BriefSkillEstimate = {
  skill: string;
  level: "Beginner";
  proofStatus: "Unverified";
};

/**
 * A user-authored Build Brief seeds a private, provisional Beginner estimate.
 * The controlled vocabulary uses the selected context plus clear terms in the
 * title and intended outcome. It is not source-backed proof or share-ready.
 */
const skillSuggestionsByContextPack: Record<BuildContextPack, ContextSkillSuggestions> = {
  software_product: {
    fallbackSkills: ["Product discovery", "Solution architecture", "Software delivery"],
    refinementRules: [
      { skill: "Mobile app development", terms: ["android", "ios", "mobile app", "flutter", "react native"] },
      { skill: "Game development", terms: ["unity", "unreal", "game", "gaming", "gamified"] },
      { skill: "Backend development", terms: ["nodejs", "node.js", "backend", "back-end", "api", "server", "database"] },
      { skill: "Frontend development", terms: ["frontend", "front-end", "web app", "next.js", "nextjs", "react"] },
      { skill: "Cloud engineering", terms: ["cloud", "azure", "aws", "gcp"] },
      { skill: "Applied AI development", terms: ["openai", "llm", "machine learning", "artificial intelligence"] },
    ],
  },
  business_venture: {
    fallbackSkills: ["Customer research", "Offer design", "Strategic planning"],
    refinementRules: [
      { skill: "Customer discovery", terms: ["customer interview", "customer research", "user research", "validation"] },
      { skill: "Pricing strategy", terms: ["pricing", "price", "offer"] },
      { skill: "Sales development", terms: ["sales", "lead", "pipeline", "prospect"] },
      { skill: "Business modelling", terms: ["business model", "revenue model", "unit economics"] },
    ],
  },
  marketing_growth: {
    fallbackSkills: ["Audience research", "Campaign strategy", "Marketing analytics"],
    refinementRules: [
      { skill: "Social media marketing", terms: ["social media", "instagram", "linkedin", "tiktok", "twitter", "x.com"] },
      { skill: "Search engine optimization", terms: ["seo", "search engine", "organic search"] },
      { skill: "Email marketing", terms: ["email", "newsletter", "lifecycle"] },
      { skill: "Content marketing", terms: ["content", "blog", "video", "editorial"] },
      { skill: "Performance marketing", terms: ["paid ads", "advertising", "campaign", "acquisition"] },
    ],
  },
  operations_process: {
    fallbackSkills: ["Process mapping", "Workflow design", "Operational measurement"],
    refinementRules: [
      { skill: "Workflow automation", terms: ["automation", "automate", "integration", "zapier"] },
      { skill: "Process improvement", terms: ["process", "sop", "bottleneck", "efficiency"] },
      { skill: "Operations analytics", terms: ["kpi", "metric", "dashboard", "reporting"] },
      { skill: "Operational planning", terms: ["inventory", "logistics", "capacity", "scheduling"] },
    ],
  },
};

export function briefSkillEstimatesForBuild(
  buildBrief: Pick<BuildBrief, "primaryContextPack" | "title" | "outcome">,
): readonly BriefSkillEstimate[] {
  const suggestions = skillSuggestionsByContextPack[buildBrief.primaryContextPack];
  const briefText = `${buildBrief.title} ${buildBrief.outcome}`.toLocaleLowerCase();
  const matchedSkills = suggestions.refinementRules
    .filter((rule) => rule.terms.some((term) => briefText.includes(term)))
    .map((rule) => rule.skill);

  return Array.from(new Set([...matchedSkills, ...suggestions.fallbackSkills]))
    .slice(0, 3)
    .map((skill) => ({ skill, level: "Beginner", proofStatus: "Unverified" }));
}

export function isBuildBrief(value: unknown): value is BuildBrief {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.outcome === "string" &&
    typeof value.status === "string" &&
    isBuildContextPack(value.primaryContextPack) &&
    typeof value.updatedAt === "string"
  );
}

export function isBuildContextPack(value: unknown): value is BuildContextPack {
  return typeof value === "string" && buildContextPacks.includes(value as BuildContextPack);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
