/**
 * Pure domain contracts for the explainable skill-assessment rubric.
 *
 * Source IDs must be stable and namespaced by the persistence layer (for
 * example, `evidence_source:uuid`). They are deliberately opaque here: this
 * service never fetches, verifies, or publishes a source.
 */

export const SKILL_LEVELS = [
  "not_yet_assessed",
  "novice",
  "beginner",
  "intermediate",
  "advanced",
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number];

export type AssessedSkillLevel = Exclude<SkillLevel, "not_yet_assessed">;

/** Mirrors the evidence-card lifecycle in the database foundation. */
export type EvidenceStatus =
  | "suggested"
  | "confirmed"
  | "linked"
  | "outcome_supported"
  | "dismissed"
  | "revoked";

export type EvidenceContribution = "individual" | "team";

/** A source can be private; `kind` describes the proof, not its visibility. */
export type EvidenceSourceKind =
  | "user_explanation"
  | "chat_message"
  | "decision"
  | "artifact"
  | "task_output"
  | "repository"
  | "deployment"
  | "metric_snapshot"
  | "self_attestation"
  | "external_credential"
  | "public_outcome"
  | "other";

export interface EvidenceSourceReference {
  readonly id: string;
  readonly kind: EvidenceSourceKind;
}

export type CoreEvidenceSignal =
  | "exploration"
  | "guided_execution"
  | "independent_execution"
  | "reasoning"
  | "tradeoff"
  | "measurement"
  | "iteration"
  | "outcome"
  | "leadership";

/** Capability policies may add namespaced signals, for example
 * `capability:social-media-marketing:audience-strategy`.
 */
export type EvidenceSignal = CoreEvidenceSignal | `capability:${string}`;

export interface SkillEvidence {
  readonly id: string;
  readonly status: EvidenceStatus;

  /**
   * A stable identifier for the underlying interaction, task, submission, or
   * artifact event. Multiple cards from one event are counted once.
   */
  readonly eventId?: string;

  /** At least one valid source is required before evidence can be assessed. */
  readonly sources: readonly EvidenceSourceReference[];

  /**
   * When present, all evidence from the same project is one independent work
   * anchor. It takes precedence over `independentWorkId` to prevent a single
   * project being split into artificial breadth.
   */
  readonly projectId?: string;

  /**
   * Stable ID for a non-project work episode, such as a certification attempt
   * or competition submission. Do not assign a distinct value per card for
   * the same underlying work.
   */
  readonly independentWorkId?: string;

  readonly contribution: EvidenceContribution;

  /** Required for team evidence so the assessment represents the user's role. */
  readonly roleStatement?: string;

  /** Human-confirmed, source-supported claims normalized by upstream code. */
  readonly signals: readonly EvidenceSignal[];
}

export interface CapabilitySignalRequirement {
  /** A core or `capability:` signal required in addition to the core rubric. */
  readonly signal: EvidenceSignal;
  readonly label: string;
  readonly description: string;
}

/**
 * A capability can add transparent gates without weakening the core trust,
 * breadth, source, or anti-jump safeguards.
 */
export interface CapabilityAssessmentPolicy {
  readonly id: string;
  readonly version: string;
  readonly requiredSignalsByLevel?: Readonly<
    Partial<
      Record<AssessedSkillLevel, readonly CapabilitySignalRequirement[]>
    >
  >;
}

export interface SkillAssessmentInput {
  readonly capabilityId: string;
  readonly evidence: readonly SkillEvidence[];
  readonly policy?: CapabilityAssessmentPolicy;
}

export type ExcludedEvidenceReason =
  | "NOT_CONFIRMED"
  | "REVOKED"
  | "MISSING_SOURCE"
  | "INVALID_SOURCE_REFERENCE"
  | "TEAM_ROLE_MISSING"
  | "DUPLICATE_EVENT";

export interface ExcludedEvidence {
  readonly evidenceId: string;
  readonly reason: ExcludedEvidenceReason;
  readonly detail: string;
}

export interface AssessmentCriterion {
  readonly id: string;
  readonly level: AssessedSkillLevel;
  readonly label: string;
  readonly description: string;
  readonly contributingEvidenceIds: readonly string[];
}

export interface SkillAssessmentResult {
  readonly capabilityId: string;
  readonly level: SkillLevel;
  readonly rubricVersion: string;
  readonly policyId: string;
  readonly contributingEvidenceIds: readonly string[];
  readonly eligibleEvidenceIds: readonly string[];
  readonly excludedEvidence: readonly ExcludedEvidence[];
  readonly satisfiedCriteria: readonly AssessmentCriterion[];
  readonly missingCriteria: readonly AssessmentCriterion[];
}
