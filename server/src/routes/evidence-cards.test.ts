import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app.js";
import type {
  AccessTokenVerifier,
  AuthenticatedRequestContext,
} from "../auth/access-token-verifier.js";
import type { ServerConfig } from "../config/env.js";
import type {
  BuildBriefDto,
  BuildBriefListQuery,
  CreateBuildBriefRequest,
  UpdateBuildBriefRequest,
} from "../contracts/build-brief.contract.js";
import type {
  CreateManualEvidenceCardRequest,
  EvidenceCardDto,
  EvidenceCardListQuery,
  EvidenceTransitionAction,
} from "../contracts/evidence-card.contract.js";
import type {
  BuildBriefRepository,
  BuildBriefUpdateResult,
} from "../repositories/build-brief.repository.js";
import type {
  EvidenceCardRepository,
  EvidenceCardTransitionResult,
} from "../repositories/evidence-card.repository.js";

const testConfig: ServerConfig = {
  nodeEnv: "test",
  port: 0,
  frontendUrl: "http://localhost:3000",
};

const user: AuthenticatedRequestContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
};

const buildBrief: BuildBriefDto = {
  id: "22222222-2222-4222-8222-222222222222",
  revision: 1,
  status: "active",
  title: "Community launch loop",
  primaryContextPack: "marketing_growth",
  outcome: "Test a repeatable community acquisition loop.",
  metric: null,
  timeboxEndsAt: null,
  evidenceCaptureEnabled: true,
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

const evidenceCard: EvidenceCardDto = {
  id: "33333333-3333-4333-8333-333333333333",
  buildId: buildBrief.id,
  origin: "user",
  status: "suggested",
  claimSummary: "Synthesized three customer interviews into an onboarding decision.",
  contribution: "individual",
  sources: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      type: "self_attestation",
      label: "Interview synthesis notes",
      excerpt: "Three participants could not find the first project action.",
      createdAt: "2026-07-21T00:00:00.000Z",
    },
  ],
  reviewedAt: null,
  confirmedAt: null,
  revokedAt: null,
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

function configuredVerifier(): AccessTokenVerifier {
  return {
    isConfigured: true,
    async verifyAccessToken() {
      return user;
    },
  };
}

function buildRepository(
  options: { readonly ownsBuild?: boolean } = {},
): BuildBriefRepository {
  return {
    isConfigured: true,
    async list(_userId: string, _query: BuildBriefListQuery) {
      return [buildBrief];
    },
    async findById(_userId: string, _buildId: string) {
      return options.ownsBuild === false ? undefined : buildBrief;
    },
    async create(_userId: string, _input: CreateBuildBriefRequest) {
      return buildBrief;
    },
    async update(
      _userId: string,
      _buildId: string,
      _input: UpdateBuildBriefRequest,
    ): Promise<BuildBriefUpdateResult> {
      return { kind: "updated", buildBrief };
    },
  };
}

function evidenceRepository(
  options: {
    readonly onCreate?: (
      userId: string,
      buildId: string,
      input: CreateManualEvidenceCardRequest,
    ) => void;
    readonly onList?: () => void;
    readonly transitionResult?: EvidenceCardTransitionResult;
  } = {},
): EvidenceCardRepository {
  return {
    isConfigured: true,
    async list(_userId: string, _buildId: string, _query: EvidenceCardListQuery) {
      options.onList?.();
      return [evidenceCard];
    },
    async findById(_userId: string, _buildId: string, _evidenceCardId: string) {
      return evidenceCard;
    },
    async create(userId, buildId, input) {
      options.onCreate?.(userId, buildId, input);
      return evidenceCard;
    },
    async transition(
      _userId: string,
      _buildId: string,
      _evidenceCardId: string,
      _action: EvidenceTransitionAction | "revoke",
      _revocationReason?: string,
    ) {
      return options.transitionResult ?? { kind: "updated", evidenceCard };
    },
  };
}

async function withApi<T>(
  builds: BuildBriefRepository,
  evidence: EvidenceCardRepository,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createApp(testConfig, {
    accessTokenVerifier: configuredVerifier(),
    buildBriefRepository: builds,
    evidenceCardRepository: evidence,
  }).listen(0, "127.0.0.1");

  await once(server, "listening");
  const address = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("manual evidence injects the verified owner and stays a suggested private record", async () => {
  const calls: Array<{
    userId: string;
    buildId: string;
    input: CreateManualEvidenceCardRequest;
  }> = [];

  await withApi(
    buildRepository(),
    evidenceRepository({
      onCreate(userId, buildId, input) {
        calls.push({ userId, buildId, input });
      },
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/builds/${buildBrief.id}/evidence-cards`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claimSummary: "  Synthesized three customer interviews into an onboarding decision.  ",
          contribution: "individual",
          source: {
            label: "  Interview synthesis notes  ",
            excerpt: "  Three participants could not find the first project action.  ",
          },
          idempotencyKey: "55555555-5555-4555-8555-555555555555",
          userId: "99999999-9999-4999-8999-999999999999",
        }),
      });

      assert.equal(response.status, 400, "unknown owner input must be rejected rather than trusted");
    },
  );

  assert.equal(calls.length, 0);

  await withApi(
    buildRepository(),
    evidenceRepository({
      onCreate(userId, buildId, input) {
        calls.push({ userId, buildId, input });
      },
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/builds/${buildBrief.id}/evidence-cards`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claimSummary: "  Synthesized three customer interviews into an onboarding decision.  ",
          contribution: "individual",
          source: {
            label: "  Interview synthesis notes  ",
            excerpt: "  Three participants could not find the first project action.  ",
          },
          idempotencyKey: "55555555-5555-4555-8555-555555555555",
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { data: { evidenceCard } });
    },
  );

  assert.deepEqual(calls, [
    {
      userId: user.userId,
      buildId: buildBrief.id,
      input: {
        claimSummary: "Synthesized three customer interviews into an onboarding decision.",
        contribution: "individual",
        source: {
          label: "Interview synthesis notes",
          excerpt: "Three participants could not find the first project action.",
        },
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
      },
    },
  ]);
});

test("team evidence requires a role statement before the repository is called", async () => {
  let called = false;
  await withApi(
    buildRepository(),
    evidenceRepository({ onCreate: () => { called = true; } }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/builds/${buildBrief.id}/evidence-cards`, {
        method: "POST",
        headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
        body: JSON.stringify({
          claimSummary: "Contributed to a campaign launch.",
          contribution: "team",
          source: { label: "Campaign notes", excerpt: "The campaign launched on schedule." },
        }),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: {
          code: "INVALID_REQUEST",
          message: "One or more request values are invalid.",
        },
      });
    },
  );

  assert.equal(called, false);
});

test("a non-owned build uses the same generic 404 and never lists its evidence", async () => {
  let listCalled = false;
  await withApi(
    buildRepository({ ownsBuild: false }),
    evidenceRepository({ onList: () => { listCalled = true; } }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/builds/${buildBrief.id}/evidence-cards`, {
        headers: { Authorization: "Bearer test-token" },
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: { code: "BUILD_NOT_FOUND", message: "Build Brief not found." },
      });
    },
  );

  assert.equal(listCalled, false);
});

test("an illegal evidence lifecycle action returns a safe conflict", async () => {
  await withApi(
    buildRepository(),
    evidenceRepository({ transitionResult: { kind: "invalid_transition" } }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/builds/${buildBrief.id}/evidence-cards/${evidenceCard.id}`, {
        method: "PATCH",
        headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error: {
          code: "EVIDENCE_CARD_TRANSITION_CONFLICT",
          message: "This evidence record cannot take that action in its current state.",
        },
      });
    },
  );
});
