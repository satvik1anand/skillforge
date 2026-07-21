export const evidenceCardStatuses = [
  "suggested",
  "confirmed",
  "linked",
  "outcome_supported",
  "dismissed",
  "revoked",
] as const;

export type EvidenceCardStatus = (typeof evidenceCardStatuses)[number];
export type EvidenceContribution = "individual" | "team";

export type EvidenceSource = {
  id: string;
  type: string;
  label: string;
  excerpt?: string;
  createdAt: string;
};

/** A private evidence record; it is intentionally not a skill claim. */
export type EvidenceCard = {
  id: string;
  buildId: string;
  origin: "ai" | "user" | "import";
  status: EvidenceCardStatus;
  claimSummary: string;
  contribution: EvidenceContribution;
  roleStatement?: string;
  sources: EvidenceSource[];
  reviewedAt: string | null;
  confirmedAt: string | null;
  revokedAt: string | null;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
};

export function isEvidenceCard(value: unknown): value is EvidenceCard {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isId(value.id)
    && isId(value.buildId)
    && (value.origin === "ai" || value.origin === "user" || value.origin === "import")
    && isEvidenceCardStatus(value.status)
    && typeof value.claimSummary === "string"
    && (value.contribution === "individual" || value.contribution === "team")
    && optionalString(value.roleStatement)
    && Array.isArray(value.sources)
    && value.sources.every(isEvidenceSource)
    && nullableTimestamp(value.reviewedAt)
    && nullableTimestamp(value.confirmedAt)
    && nullableTimestamp(value.revokedAt)
    && optionalString(value.revocationReason)
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt)
  );
}

export function isEvidenceCardStatus(value: unknown): value is EvidenceCardStatus {
  return typeof value === "string" && evidenceCardStatuses.includes(value as EvidenceCardStatus);
}

export function evidenceStatusLabel(status: EvidenceCardStatus): string {
  return status.replaceAll("_", " ");
}

function isEvidenceSource(value: unknown): value is EvidenceSource {
  return (
    isRecord(value)
    && isId(value.id)
    && typeof value.type === "string"
    && typeof value.label === "string"
    && optionalString(value.excerpt)
    && isTimestamp(value.createdAt)
  );
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function nullableTimestamp(value: unknown): boolean {
  return value === null || isTimestamp(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
