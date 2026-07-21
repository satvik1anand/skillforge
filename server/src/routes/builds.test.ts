import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import {
  type AccessTokenVerifier,
  type AuthenticatedRequestContext,
} from "../auth/access-token-verifier.js";
import { createApp } from "../app.js";
import type { ServerConfig } from "../config/env.js";
import type {
  BuildBriefDto,
  BuildBriefListQuery,
  CreateBuildBriefRequest,
  UpdateBuildBriefRequest,
} from "../contracts/build-brief.contract.js";
import type {
  BuildBriefRepository,
  BuildBriefUpdateResult,
} from "../repositories/build-brief.repository.js";

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
  status: "draft",
  title: "Community launch loop",
  primaryContextPack: "marketing_growth",
  outcome: "Test a repeatable community acquisition loop.",
  metric: null,
  timeboxEndsAt: null,
  evidenceCaptureEnabled: false,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

function configuredVerifier(): AccessTokenVerifier {
  return {
    isConfigured: true,
    async verifyAccessToken() {
      return user;
    },
  };
}

async function withApi<T>(
  repository: BuildBriefRepository | undefined,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createApp(testConfig, {
    accessTokenVerifier: configuredVerifier(),
    ...(repository ? { buildBriefRepository: repository } : {}),
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

test("build routes report an explicit 503 when storage is not configured", async () => {
  const response = await withApi(undefined, (baseUrl) =>
    fetch(`${baseUrl}/api/v1/builds`, {
      headers: { Authorization: "Bearer a-test-token" },
    }),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "PERSISTENCE_UNAVAILABLE",
      message: "Build storage is currently unavailable.",
    },
  });
});

test("build routes inject the verified owner and surface optimistic conflicts safely", async () => {
  const calls: Array<{
    operation: string;
    userId: string;
    input?: CreateBuildBriefRequest | UpdateBuildBriefRequest | BuildBriefListQuery;
  }> = [];
  const repository: BuildBriefRepository = {
    isConfigured: true,
    async list(userId, query) {
      calls.push({ operation: "list", userId, input: query });
      return [buildBrief];
    },
    async findById(userId) {
      calls.push({ operation: "find", userId });
      return buildBrief;
    },
    async create(userId, input) {
      calls.push({ operation: "create", userId, input });
      return buildBrief;
    },
    async update(userId, _buildId, input): Promise<BuildBriefUpdateResult> {
      calls.push({ operation: "update", userId, input });
      return { kind: "revision_conflict" };
    },
  };

  await withApi(repository, async (baseUrl) => {
    const list = await fetch(`${baseUrl}/api/v1/builds?limit=1`, {
      headers: { Authorization: "Bearer a-test-token" },
    });
    assert.equal(list.status, 200);
    assert.equal(list.headers.get("cache-control"), "no-store");

    const created = await fetch(`${baseUrl}/api/v1/builds`, {
      method: "POST",
      headers: {
        Authorization: "Bearer a-test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Community launch loop",
        primaryContextPack: "marketing_growth",
        outcome: "Test a repeatable community acquisition loop.",
        evidenceCaptureEnabled: false,
      }),
    });
    assert.equal(created.status, 201);

    const conflict = await fetch(`${baseUrl}/api/v1/builds/${buildBrief.id}`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer a-test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedRevision: 1, title: "Updated title" }),
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {
      error: {
        code: "BUILD_BRIEF_REVISION_CONFLICT",
        message: "This Build Brief changed. Refresh and try again.",
      },
    });
  });

  assert.deepEqual(calls, [
    { operation: "list", userId: user.userId, input: { limit: 1 } },
    {
      operation: "create",
      userId: user.userId,
      input: {
        title: "Community launch loop",
        primaryContextPack: "marketing_growth",
        outcome: "Test a repeatable community acquisition loop.",
        evidenceCaptureEnabled: false,
      },
    },
    {
      operation: "update",
      userId: user.userId,
      input: { expectedRevision: 1, title: "Updated title" },
    },
  ]);
});
