export const skillLevels = [
  "not_yet_assessed",
  "novice",
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const skillProofStatuses = [
  "unverified_estimate",
  "proof_linked",
  "source_validated",
  "independently_verified",
] as const;

export const skillEstimateBases = [
  "brief_derived",
  "evidence_derived",
  "chat_inferred",
] as const;

export type SkillLevel = (typeof skillLevels)[number];
export type SkillProofStatus = (typeof skillProofStatuses)[number];
export type SkillEstimateBasis = (typeof skillEstimateBases)[number];

export type BuildSkillOverviewItem = {
  capabilityId: string;
  capabilitySlug: string;
  capabilityName: string;
  level: SkillLevel;
  proofStatus: SkillProofStatus;
  assessmentBasis: SkillEstimateBasis;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringIn<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function isBuildSkillOverviewItem(value: unknown): value is BuildSkillOverviewItem {
  return isRecord(value)
    && typeof value.capabilityId === "string"
    && typeof value.capabilitySlug === "string"
    && typeof value.capabilityName === "string"
    && isStringIn(value.level, skillLevels)
    && isStringIn(value.proofStatus, skillProofStatuses)
    && isStringIn(value.assessmentBasis, skillEstimateBases);
}

export function readBuildSkillOverviewResponse(
  payload: unknown,
): BuildSkillOverviewItem[] | undefined {
  if (
    !isRecord(payload)
    || !isRecord(payload.data)
    || !Array.isArray(payload.data.skillProfiles)
    || !payload.data.skillProfiles.every(isBuildSkillOverviewItem)
  ) {
    return undefined;
  }

  return payload.data.skillProfiles;
}

export function skillLevelLabel(level: SkillLevel): string {
  return level === "not_yet_assessed"
    ? "Not yet assessed"
    : `${level.slice(0, 1).toUpperCase()}${level.slice(1)}`;
}

export function skillProofStatusLabel(status: SkillProofStatus): string {
  switch (status) {
    case "unverified_estimate":
      return "Unverified";
    case "proof_linked":
      return "Proof linked";
    case "source_validated":
      return "Source validated";
    case "independently_verified":
      return "Independently verified";
  }
}

export function skillEstimateBasisLabel(basis: SkillEstimateBasis): string {
  switch (basis) {
    case "brief_derived":
      return "Brief-derived";
    case "chat_inferred":
      return "Chat-inferred";
    case "evidence_derived":
      return "Evidence-derived";
  }
}
