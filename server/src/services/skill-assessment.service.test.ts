import assert from "node:assert/strict";
import test from "node:test";

import type { SkillEvidence } from "../domain/skill-assessment.js";
import { assessSkill } from "./skill-assessment.service.js";

const capabilityId = "social-media-marketing";

function evidence(
  id: string,
  overrides: Partial<SkillEvidence> = {},
): SkillEvidence {
  return {
    id,
    status: "confirmed",
    eventId: id,
    sources: [{ id: `source-${id}`, kind: "artifact" }],
    projectId: `project-${id}`,
    contribution: "individual",
    signals: ["guided_execution", "reasoning"],
    ...overrides,
  };
}

test("one confirmed bounded task can establish a Beginner estimate", () => {
  const result = assessSkill({
    capabilityId,
    evidence: [evidence("first-task")],
  });

  assert.equal(result.level, "beginner");
  assert.deepEqual(result.contributingEvidenceIds, ["first-task"]);
});

test("Intermediate requires independent work, concrete sources, execution, reasoning, and learning", () => {
  const result = assessSkill({
    capabilityId,
    evidence: [
      evidence("campaign-plan", {
        projectId: "campaign-one",
        sources: [{ id: "brief-one", kind: "artifact" }],
        signals: ["independent_execution", "reasoning"],
      }),
      evidence("campaign-measurement", {
        projectId: "campaign-one",
        sources: [{ id: "metrics-one", kind: "metric_snapshot" }],
        signals: ["independent_execution", "measurement"],
      }),
      evidence("campaign-iteration", {
        projectId: "campaign-two",
        sources: [{ id: "decision-two", kind: "decision" }],
        signals: ["independent_execution", "outcome", "iteration"],
      }),
    ],
  });

  assert.equal(result.level, "intermediate");
  assert.equal(result.missingCriteria.some((item) => item.level === "intermediate"), false);
});

test("chat-only evidence cannot establish an Intermediate estimate", () => {
  const result = assessSkill({
    capabilityId,
    evidence: [
      evidence("chat-one", {
        projectId: "project-one",
        sources: [{ id: "chat-source-one", kind: "chat_message" }],
        signals: ["independent_execution", "reasoning"],
      }),
      evidence("chat-two", {
        projectId: "project-one",
        sources: [{ id: "chat-source-two", kind: "chat_message" }],
        signals: ["independent_execution", "measurement"],
      }),
      evidence("chat-three", {
        projectId: "project-two",
        sources: [{ id: "chat-source-three", kind: "chat_message" }],
        signals: ["independent_execution", "outcome"],
      }),
    ],
  });

  assert.equal(result.level, "beginner");
  assert.equal(
    result.missingCriteria.some(
      (item) => item.id === "intermediate-concrete-evidence",
    ),
    true,
  );
});

test("team evidence without a declared role is excluded", () => {
  const result = assessSkill({
    capabilityId,
    evidence: [
      evidence("team-result", {
        contribution: "team",
        roleStatement: " ",
      }),
    ],
  });

  assert.equal(result.level, "not_yet_assessed");
  assert.deepEqual(result.excludedEvidence, [
    {
      evidenceId: "team-result",
      reason: "TEAM_ROLE_MISSING",
      detail: "Team evidence needs an explicit statement of the user's role.",
    },
  ]);
});

test("duplicate cards for one event cannot inflate evidence breadth", () => {
  const result = assessSkill({
    capabilityId,
    evidence: [
      evidence("event-card-one", {
        eventId: "same-event",
        signals: ["guided_execution", "reasoning"],
      }),
      evidence("event-card-two", {
        eventId: "same-event",
        signals: ["independent_execution", "measurement"],
      }),
    ],
  });

  assert.equal(result.eligibleEvidenceIds.length, 1);
  assert.equal(
    result.excludedEvidence.some(
      (item) => item.reason === "DUPLICATE_EVENT",
    ),
    true,
  );
});
