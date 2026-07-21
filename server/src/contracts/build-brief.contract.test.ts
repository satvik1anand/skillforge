import assert from "node:assert/strict";
import test from "node:test";

import {
  createBuildBriefRequestSchema,
  updateBuildBriefRequestSchema,
} from "./build-brief.contract.js";

const validBuildBrief = {
  title: "  Community launch loop  ",
  primaryContextPack: "marketing_growth",
  outcome: "  Test a repeatable community acquisition loop.  ",
  roleStatement: "Owned experiment design and reporting.",
  metric: {
    label: "Qualified sign-ups",
    unit: "people",
    baselineValue: 12,
    targetValue: 30,
  },
  evidenceCaptureEnabled: true,
} as const;

test("Build Brief creation trims text and keeps capture an explicit private setting", () => {
  const parsed = createBuildBriefRequestSchema.parse(validBuildBrief);

  assert.equal(parsed.title, "Community launch loop");
  assert.equal(parsed.outcome, "Test a repeatable community acquisition loop.");
  assert.equal(parsed.evidenceCaptureEnabled, true);
});

test("Build Brief metric data requires a meaningful label", () => {
  const result = createBuildBriefRequestSchema.safeParse({
    ...validBuildBrief,
    metric: {
      targetValue: 30,
    },
  });

  assert.equal(result.success, false);
});

test("Build Brief updates require both a revision and a real mutation", () => {
  const result = updateBuildBriefRequestSchema.safeParse({
    expectedRevision: 1,
  });

  assert.equal(result.success, false);
});
