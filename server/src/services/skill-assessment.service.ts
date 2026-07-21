import {
  type AssessmentCriterion,
  type AssessedSkillLevel,
  type CapabilityAssessmentPolicy,
  type CapabilitySignalRequirement,
  type EvidenceSourceKind,
  type EvidenceSignal,
  type ExcludedEvidence,
  type ExcludedEvidenceReason,
  type SkillAssessmentInput,
  type SkillAssessmentResult,
  type SkillEvidence,
} from "../domain/skill-assessment.js";

/** Increment when a core rule changes; policy versions are appended to it. */
export const SKILL_ASSESSMENT_RUBRIC_VERSION = "skillforge-core-v1";

export const DEFAULT_CAPABILITY_ASSESSMENT_POLICY: CapabilityAssessmentPolicy = {
  id: "core",
  version: "1",
};

const ASSESSED_LEVELS: readonly AssessedSkillLevel[] = [
  "novice",
  "beginner",
  "intermediate",
  "advanced",
];

const HIGHER_LEVEL_SOURCE_KINDS: readonly EvidenceSourceKind[] = [
  "decision",
  "artifact",
  "task_output",
  "repository",
  "deployment",
  "metric_snapshot",
  "external_credential",
  "public_outcome",
];

type EligibleEvidence = {
  readonly evidence: SkillEvidence;
  readonly eventKey: string;
  readonly workAnchorKey: string;
  readonly sourceIds: readonly string[];
  readonly hasHigherLevelSource: boolean;
};

type CriterionEvaluation = AssessmentCriterion & {
  readonly isSatisfied: boolean;
};

type AssessmentContext = {
  readonly evidence: readonly EligibleEvidence[];
  readonly byWorkAnchor: ReadonlyMap<string, readonly EligibleEvidence[]>;
  readonly bySourceId: ReadonlyMap<string, readonly EligibleEvidence[]>;
};

/**
 * Calculates a level from user-confirmed, non-revoked, source-backed evidence.
 * It is deliberately pure: storage, source verification, model judgment, and
 * UI wording remain outside this service.
 */
export function assessSkill(
  input: SkillAssessmentInput,
): SkillAssessmentResult {
  const policy = input.policy ?? DEFAULT_CAPABILITY_ASSESSMENT_POLICY;
  const excludedEvidence: ExcludedEvidence[] = [];
  const candidates: EligibleEvidence[] = [];

  for (const evidence of input.evidence) {
    const exclusion = getExclusion(evidence);
    if (exclusion) {
      excludedEvidence.push(exclusion);
      continue;
    }

    candidates.push(toEligibleEvidence(evidence));
  }

  const evidence = deduplicateEvents(candidates, excludedEvidence);
  const context = createContext(evidence);
  const evaluations = ASSESSED_LEVELS.flatMap((level) => [
    ...evaluateCoreCriteria(level, context),
    ...evaluatePolicyCriteria(level, context, policy),
  ]);

  const level = deriveLevel(evaluations);
  const contributingEvidenceIds = collectContributingEvidence(evaluations, level);

  return {
    capabilityId: input.capabilityId,
    level,
    rubricVersion: `${SKILL_ASSESSMENT_RUBRIC_VERSION}+${policy.id}@${policy.version}`,
    policyId: policy.id,
    contributingEvidenceIds,
    eligibleEvidenceIds: evidence.map(({ evidence: item }) => item.id),
    excludedEvidence: excludedEvidence.sort(compareExcludedEvidence),
    satisfiedCriteria: evaluations
      .filter((criterion) => criterion.isSatisfied)
      .map(toCriterion),
    missingCriteria: evaluations
      .filter((criterion) => !criterion.isSatisfied)
      .map(toCriterion),
  };
}

function getExclusion(evidence: SkillEvidence): ExcludedEvidence | undefined {
  if (evidence.status === "revoked") {
    return excluded(evidence.id, "REVOKED", "Revoked evidence cannot support a skill level.");
  }

  if (
    evidence.status !== "confirmed" &&
    evidence.status !== "linked" &&
    evidence.status !== "outcome_supported"
  ) {
    return excluded(
      evidence.id,
      "NOT_CONFIRMED",
      "Only user-confirmed evidence can support a skill level.",
    );
  }

  if (evidence.sources.length === 0) {
    return excluded(
      evidence.id,
      "MISSING_SOURCE",
      "Evidence must cite at least one source before it can be assessed.",
    );
  }

  if (evidence.sources.some((source) => !isNonBlank(source.id) || !isNonBlank(source.kind))) {
    return excluded(
      evidence.id,
      "INVALID_SOURCE_REFERENCE",
      "Every cited source needs a stable ID and a source kind.",
    );
  }

  if (evidence.contribution === "team" && !isNonBlank(evidence.roleStatement)) {
    return excluded(
      evidence.id,
      "TEAM_ROLE_MISSING",
      "Team evidence needs an explicit statement of the user's role.",
    );
  }

  return undefined;
}

function toEligibleEvidence(evidence: SkillEvidence): EligibleEvidence {
  const sourceIds = uniqueSorted(evidence.sources.map((source) => source.id.trim()));
  const projectId = normalized(evidence.projectId);
  const independentWorkId = normalized(evidence.independentWorkId);

  return {
    evidence,
    eventKey: normalized(evidence.eventId) ?? `evidence:${evidence.id}`,
    // A project always defines the work boundary. This prevents several cards
    // from one project being relabelled as independent work episodes.
    workAnchorKey:
      projectId !== undefined
        ? `project:${projectId}`
        : independentWorkId !== undefined
          ? `work:${independentWorkId}`
          : `source:${sourceIds.join("|")}`,
    sourceIds,
    hasHigherLevelSource: evidence.sources.some((source) =>
      HIGHER_LEVEL_SOURCE_KINDS.includes(source.kind),
    ),
  };
}

function deduplicateEvents(
  candidates: readonly EligibleEvidence[],
  exclusions: ExcludedEvidence[],
): EligibleEvidence[] {
  const byEvent = new Map<string, EligibleEvidence[]>();

  for (const candidate of candidates) {
    const current = byEvent.get(candidate.eventKey);
    if (current) {
      current.push(candidate);
    } else {
      byEvent.set(candidate.eventKey, [candidate]);
    }
  }

  const retained: EligibleEvidence[] = [];
  for (const group of byEvent.values()) {
    const canonical = group.slice().sort(compareEvidenceStrength)[0];
    if (!canonical) {
      continue;
    }

    retained.push(canonical);
    for (const duplicate of group) {
      if (duplicate === canonical) {
        continue;
      }

      exclusions.push(
        excluded(
          duplicate.evidence.id,
          "DUPLICATE_EVENT",
          `Only ${canonical.evidence.id} is counted for event ${duplicate.eventKey}.`,
        ),
      );
    }
  }

  return retained.sort((left, right) => left.evidence.id.localeCompare(right.evidence.id));
}

/** Prefer a concrete source, then fuller provenance, then stable ID. */
function compareEvidenceStrength(left: EligibleEvidence, right: EligibleEvidence): number {
  if (left.hasHigherLevelSource !== right.hasHigherLevelSource) {
    return left.hasHigherLevelSource ? -1 : 1;
  }

  if (left.sourceIds.length !== right.sourceIds.length) {
    return right.sourceIds.length - left.sourceIds.length;
  }

  const leftSignals = uniqueSorted(left.evidence.signals).length;
  const rightSignals = uniqueSorted(right.evidence.signals).length;
  if (leftSignals !== rightSignals) {
    return rightSignals - leftSignals;
  }

  return left.evidence.id.localeCompare(right.evidence.id);
}

function createContext(evidence: readonly EligibleEvidence[]): AssessmentContext {
  return {
    evidence,
    byWorkAnchor: groupBy(evidence, (item) => item.workAnchorKey),
    bySourceId: groupByMany(evidence, (item) => item.sourceIds),
  };
}

function evaluateCoreCriteria(
  level: AssessedSkillLevel,
  context: AssessmentContext,
): CriterionEvaluation[] {
  switch (level) {
    case "novice":
      return [
        atLeastEvidence(
          "novice-confirmed-source-backed-evidence",
          level,
          "Confirmed, source-backed evidence",
          "At least one confirmed, non-revoked, source-backed evidence item is required.",
          context.evidence,
          1,
        ),
      ];
    case "beginner":
      return [
        atLeastEvidence(
          "beginner-independent-events",
          level,
          "A bounded evidence event",
          "At least one distinct event is required; repeated cards from one event count once.",
          context.evidence,
          1,
        ),
        atLeastGroups(
          "beginner-independent-work-anchors",
          level,
          "A work anchor",
          "At least one project, work episode, or source anchor is required.",
          context.byWorkAnchor,
          1,
        ),
        atLeastGroups(
          "beginner-independent-sources",
          level,
          "A cited source",
          "At least one source record must support the bounded task.",
          context.bySourceId,
          1,
        ),
        signalCriterion(
          "beginner-applied-execution",
          level,
          "Applied execution",
          "Evidence must show a guided or independent task, not only a stated interest.",
          context.evidence,
          ["guided_execution", "independent_execution"],
          "any",
        ),
        signalCriterion(
          "beginner-rationale-or-measurement",
          level,
          "Rationale or quality check",
          "Evidence must include a basic rationale, tradeoff, or measurement.",
          context.evidence,
          ["reasoning", "tradeoff", "measurement"],
          "any",
        ),
      ];
    case "intermediate":
      return [
        atLeastEvidence(
          "intermediate-independent-events",
          level,
          "Independent evidence events",
          "At least three distinct events are required.",
          context.evidence,
          3,
        ),
        atLeastGroups(
          "intermediate-independent-work-anchors",
          level,
          "Independent work anchors",
          "At least two independent projects, work episodes, or source anchors are required.",
          context.byWorkAnchor,
          2,
        ),
        atLeastGroups(
          "intermediate-independent-sources",
          level,
          "Independent sources",
          "At least two distinct source records are required; a single URL, certificate, or project cannot establish Intermediate alone.",
          context.bySourceId,
          2,
        ),
        atLeastConcreteEvidence(
          "intermediate-concrete-evidence",
          level,
          "Concrete evidence",
          "At least two evidence events must cite an artifact, decision, task output, repository, deployment, metric, credential, or public outcome. Chat, user explanation, and self-attestation alone cannot establish Intermediate.",
          context.evidence,
          2,
        ),
        signalCriterion(
          "intermediate-independent-execution",
          level,
          "Independent execution",
          "Evidence must demonstrate independently executed work.",
          context.evidence,
          ["independent_execution"],
          "all",
        ),
        signalCriterion(
          "intermediate-reasoning",
          level,
          "Reasoning or decision-making",
          "Evidence must show the rationale behind an approach or decision.",
          context.evidence,
          ["reasoning"],
          "all",
        ),
        signalCriterion(
          "intermediate-measurement-outcome-or-iteration",
          level,
          "Measurement, outcome, or iteration",
          "Evidence must show evaluation of results or a change made from what was learned.",
          context.evidence,
          ["measurement", "outcome", "iteration"],
          "any",
        ),
      ];
    case "advanced":
      return [
        atLeastEvidence(
          "advanced-independent-events",
          level,
          "Independent evidence events",
          "At least five distinct events are required.",
          context.evidence,
          5,
        ),
        atLeastGroups(
          "advanced-independent-work-anchors",
          level,
          "Independent work anchors",
          "At least three independent projects, work episodes, or source anchors are required.",
          context.byWorkAnchor,
          3,
        ),
        atLeastGroups(
          "advanced-independent-sources",
          level,
          "Independent sources",
          "At least three distinct source records are required; one URL, certificate, or project cannot establish Advanced alone.",
          context.bySourceId,
          3,
        ),
        atLeastConcreteEvidence(
          "advanced-concrete-evidence",
          level,
          "Concrete evidence",
          "At least three evidence events must cite an artifact, decision, task output, repository, deployment, metric, credential, or public outcome. Chat, user explanation, and self-attestation alone cannot establish Advanced.",
          context.evidence,
          3,
        ),
        signalCriterion(
          "advanced-independent-execution",
          level,
          "Independent execution",
          "Evidence must demonstrate independently executed work.",
          context.evidence,
          ["independent_execution"],
          "all",
        ),
        signalCriterion(
          "advanced-reasoning",
          level,
          "Reasoning",
          "Evidence must demonstrate explicit reasoning or decision-making.",
          context.evidence,
          ["reasoning"],
          "all",
        ),
        signalCriterion(
          "advanced-outcome-or-iteration",
          level,
          "Outcome or iteration",
          "Evidence must demonstrate a result or an iteration based on what was learned.",
          context.evidence,
          ["outcome", "iteration"],
          "any",
        ),
        signalCriterion(
          "advanced-tradeoff-or-leadership",
          level,
          "Tradeoff or leadership",
          "Evidence must show a meaningful tradeoff, a complex decision, or responsible leadership.",
          context.evidence,
          ["tradeoff", "leadership"],
          "any",
        ),
      ];
  }
}

function evaluatePolicyCriteria(
  level: AssessedSkillLevel,
  context: AssessmentContext,
  policy: CapabilityAssessmentPolicy,
): CriterionEvaluation[] {
  const requirements = policy.requiredSignalsByLevel?.[level] ?? [];

  return requirements.map((requirement, index) =>
    capabilitySignalCriterion(level, context.evidence, policy, requirement, index),
  );
}

function atLeastEvidence(
  id: string,
  level: AssessedSkillLevel,
  label: string,
  description: string,
  evidence: readonly EligibleEvidence[],
  minimum: number,
): CriterionEvaluation {
  const contributors = evidence.slice(0, minimum).map((item) => item.evidence.id);
  return criterion(id, level, label, description, evidence.length >= minimum, contributors);
}

function atLeastGroups(
  id: string,
  level: AssessedSkillLevel,
  label: string,
  description: string,
  groups: ReadonlyMap<string, readonly EligibleEvidence[]>,
  minimum: number,
): CriterionEvaluation {
  const contributors = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, minimum)
    .flatMap(([, items]) => items.slice(0, 1).map((item) => item.evidence.id));
  return criterion(id, level, label, description, groups.size >= minimum, contributors);
}

function atLeastConcreteEvidence(
  id: string,
  level: AssessedSkillLevel,
  label: string,
  description: string,
  evidence: readonly EligibleEvidence[],
  minimum: number,
): CriterionEvaluation {
  const contributors = evidence
    .filter((item) => item.hasHigherLevelSource)
    .slice(0, minimum)
    .map((item) => item.evidence.id);
  return criterion(id, level, label, description, contributors.length >= minimum, contributors);
}

function signalCriterion(
  id: string,
  level: AssessedSkillLevel,
  label: string,
  description: string,
  evidence: readonly EligibleEvidence[],
  signals: readonly EvidenceSignal[],
  match: "all" | "any",
): CriterionEvaluation {
  const matching = evidence.filter((item) =>
    match === "all"
      ? signals.every((signal) => item.evidence.signals.includes(signal))
      : signals.some((signal) => item.evidence.signals.includes(signal)),
  );
  return criterion(
    id,
    level,
    label,
    description,
    matching.length > 0,
    matching.map((item) => item.evidence.id),
  );
}

function capabilitySignalCriterion(
  level: AssessedSkillLevel,
  evidence: readonly EligibleEvidence[],
  policy: CapabilityAssessmentPolicy,
  requirement: CapabilitySignalRequirement,
  index: number,
): CriterionEvaluation {
  const matching = evidence.filter((item) =>
    item.evidence.signals.includes(requirement.signal),
  );
  return criterion(
    `policy:${policy.id}:${level}:${index}:${requirement.signal}`,
    level,
    requirement.label,
    requirement.description,
    matching.length > 0,
    matching.map((item) => item.evidence.id),
  );
}

function deriveLevel(evaluations: readonly CriterionEvaluation[]):
  | "not_yet_assessed"
  | AssessedSkillLevel {
  let achieved: "not_yet_assessed" | AssessedSkillLevel = "not_yet_assessed";

  for (const level of ASSESSED_LEVELS) {
    const levelCriteria = evaluations.filter((criterion) => criterion.level === level);
    if (levelCriteria.every((criterion) => criterion.isSatisfied)) {
      achieved = level;
      continue;
    }
    break;
  }

  return achieved;
}

function collectContributingEvidence(
  evaluations: readonly CriterionEvaluation[],
  level: "not_yet_assessed" | AssessedSkillLevel,
): string[] {
  if (level === "not_yet_assessed") {
    return [];
  }

  const highestIncludedLevel = ASSESSED_LEVELS.indexOf(level);
  return uniqueSorted(
    evaluations
      .filter(
        (criterion) =>
          criterion.isSatisfied &&
          ASSESSED_LEVELS.indexOf(criterion.level) <= highestIncludedLevel,
      )
      .flatMap((criterion) => criterion.contributingEvidenceIds),
  );
}

function criterion(
  id: string,
  level: AssessedSkillLevel,
  label: string,
  description: string,
  isSatisfied: boolean,
  contributingEvidenceIds: readonly string[],
): CriterionEvaluation {
  return {
    id,
    level,
    label,
    description,
    isSatisfied,
    contributingEvidenceIds: uniqueSorted(contributingEvidenceIds),
  };
}

function toCriterion({ isSatisfied: _isSatisfied, ...criterion }: CriterionEvaluation): AssessmentCriterion {
  return criterion;
}

function groupBy<T>(
  items: readonly T[],
  keyFor: (item: T) => string,
): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

function groupByMany<T>(
  items: readonly T[],
  keysFor: (item: T) => readonly string[],
): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    for (const key of keysFor(item)) {
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
  }
  return groups;
}

function excluded(
  evidenceId: string,
  reason: ExcludedEvidenceReason,
  detail: string,
): ExcludedEvidence {
  return { evidenceId, reason, detail };
}

function compareExcludedEvidence(left: ExcludedEvidence, right: ExcludedEvidence): number {
  return left.evidenceId.localeCompare(right.evidenceId) || left.reason.localeCompare(right.reason);
}

function normalized(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isNonBlank(value: string | undefined): boolean {
  return normalized(value) !== undefined;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
