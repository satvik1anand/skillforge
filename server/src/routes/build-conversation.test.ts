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
  BuildCapabilityDto,
  BuildConversationMessageDto,
  BuildConversationSummaryDto,
  BuildInsightDto,
  BuildSkillOverviewItemDto,
  ChatSkillInferenceDto,
  QuestionAnalysisDto,
} from "../contracts/build-conversation.contract.js";
import type {
  BuildBriefRepository,
  BuildBriefUpdateResult,
} from "../repositories/build-brief.repository.js";
import type {
  BuildConversationRepository,
  BuildConversationSnapshot,
  CompleteBuildAssistantRunInput,
  PersistAssistantMessageInput,
  PersistedUserMessage,
  StartBuildAssistantRunInput,
} from "../repositories/build-conversation.repository.js";
import type {
  BuildAssistantGeneration,
  BuildAssistantGenerationInput,
  BuildAssistantProvider,
} from "../services/build-assistant.service.js";
import { createBuildAssistantProvider } from "../services/build-assistant.service.js";

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
  title: "Learning app launch",
  primaryContextPack: "software_product",
  outcome: "Validate a safe learning-app onboarding flow.",
  constraintsSummary: "Keep user data private by default.",
  metric: { label: "activation rate" },
  timeboxEndsAt: null,
  evidenceCaptureEnabled: true,
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

const capability: BuildCapabilityDto = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "solution-architecture",
  name: "Solution architecture",
  contextPracticeId: "44444444-4444-4444-8444-444444444444",
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
  ownsBuild = true,
): BuildBriefRepository {
  return {
    isConfigured: true,
    async list(_userId: string, _query: BuildBriefListQuery) {
      return ownsBuild ? [buildBrief] : [];
    },
    async findById(_userId: string, _buildId: string) {
      return ownsBuild ? buildBrief : undefined;
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

class InMemoryConversationRepository implements BuildConversationRepository {
  public readonly isConfigured = true;
  public readonly getLimits: number[] = [];
  public readonly startRunInputs: StartBuildAssistantRunInput[] = [];
  public readonly completedRunInputs: CompleteBuildAssistantRunInput[] = [];
  public recordInferenceCalls = 0;
  private conversation: BuildConversationSummaryDto | undefined;
  private messages: BuildConversationMessageDto[] = [];
  private readonly idempotency = new Map<string, BuildConversationMessageDto>();
  private readonly inferenceByMessage = new Map<string, ChatSkillInferenceDto>();

  public async getConversation(
    _userId: string,
    _buildId: string,
    limit: number,
  ): Promise<BuildConversationSnapshot> {
    this.getLimits.push(limit);
    return {
      conversation: this.conversation,
      messages: this.messages.slice(-limit),
    };
  }

  public async persistUserMessage(
    _userId: string,
    buildId: string,
    content: string,
    idempotencyKey?: string,
  ): Promise<PersistedUserMessage> {
    if (idempotencyKey) {
      const existing = this.idempotency.get(idempotencyKey);
      if (existing && this.conversation) {
        return { conversation: this.conversation, message: existing, wasExisting: true };
      }
    }

    const conversation = this.ensureConversation(buildId);
    const message: BuildConversationMessageDto = {
      id: `55555555-5555-4555-8555-${String(this.messages.length + 1).padStart(12, "0")}`,
      conversationId: conversation.id,
      buildId,
      role: "user",
      content,
      inReplyToMessageId: null,
      mode: null,
      insight: null,
      createdAt: "2026-07-21T00:00:00.000Z",
    };
    this.messages.push(message);
    if (idempotencyKey) {
      this.idempotency.set(idempotencyKey, message);
    }
    return { conversation, message, wasExisting: false };
  }

  public async findAssistantReply(
    _userId: string,
    _buildId: string,
    conversationId: string,
    userMessageId: string,
  ): Promise<BuildConversationMessageDto | undefined> {
    return this.messages.find(
      (message) => message.conversationId === conversationId
        && message.role === "assistant"
        && message.inReplyToMessageId === userMessageId,
    );
  }

  public async persistAssistantMessage(
    _userId: string,
    buildId: string,
    input: PersistAssistantMessageInput,
  ): Promise<BuildConversationMessageDto> {
    const existing = await this.findAssistantReply(
      user.userId,
      buildId,
      input.conversationId,
      input.replyToMessageId,
    );
    if (existing) {
      return existing;
    }

    const message: BuildConversationMessageDto = {
      id: `66666666-6666-4666-8666-${String(this.messages.length + 1).padStart(12, "0")}`,
      conversationId: input.conversationId,
      buildId,
      role: "assistant",
      content: input.content,
      inReplyToMessageId: input.replyToMessageId,
      mode: input.mode,
      insight: input.insight,
      createdAt: "2026-07-21T00:00:01.000Z",
    };
    this.messages.push(message);
    return message;
  }

  public async listContextCapabilities(): Promise<readonly BuildCapabilityDto[]> {
    return [capability];
  }

  public async listSkillOverview(): Promise<readonly BuildSkillOverviewItemDto[]> {
    return [{
      capabilityId: capability.id,
      capabilitySlug: capability.slug,
      capabilityName: capability.name,
      level: "beginner",
      proofStatus: "unverified_estimate",
      assessmentBasis: "brief_derived",
    }];
  }

  public async startAiRun(
    _userId: string,
    _buildId: string,
    input: StartBuildAssistantRunInput,
  ): Promise<string> {
    this.startRunInputs.push(input);
    return "77777777-7777-4777-8777-777777777777";
  }

  public async completeAiRun(
    _userId: string,
    _buildId: string,
    _aiRunId: string,
    input: CompleteBuildAssistantRunInput,
  ): Promise<void> {
    this.completedRunInputs.push(input);
  }

  public async recordInference(
    _userId: string,
    _buildId: string,
    _conversationId: string,
    sourceMessageId: string,
    selectedCapability: BuildCapabilityDto,
    candidate: { inferredLevel: "novice" | "beginner" | "intermediate" | "advanced"; rationale: string; dimensions: Array<"exploration" | "guided_execution" | "independent_execution" | "reasoning" | "tradeoff" | "measurement" | "iteration" | "outcome" | "leadership"> },
    _aiRunId: string,
  ): Promise<ChatSkillInferenceDto> {
    this.recordInferenceCalls += 1;
    const existing = this.inferenceByMessage.get(sourceMessageId);
    if (existing) {
      return existing;
    }

    const result: ChatSkillInferenceDto = {
      id: "88888888-8888-4888-8888-888888888888",
      sourceMessageId,
      capability: selectedCapability,
      inferredLevel: candidate.inferredLevel,
      previousEstimatedLevel: "not_yet_assessed",
      estimatedLevel: "novice",
      levelRaised: true,
      proofStatus: "unverified_estimate",
      visibility: "private",
      rationale: candidate.rationale,
      dimensions: candidate.dimensions,
      createdAt: "2026-07-21T00:00:01.000Z",
    };
    this.inferenceByMessage.set(sourceMessageId, result);
    return result;
  }

  public async findInferenceBySourceMessage(
    _userId: string,
    _buildId: string,
    sourceMessageId: string,
  ): Promise<ChatSkillInferenceDto | undefined> {
    return this.inferenceByMessage.get(sourceMessageId);
  }

  private ensureConversation(buildId: string): BuildConversationSummaryDto {
    if (!this.conversation) {
      this.conversation = {
        id: "99999999-9999-4999-8999-999999999999",
        buildId,
        status: "active",
        lastMessageAt: null,
        createdAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
      };
    }
    return this.conversation;
  }
}

class StubAssistantProvider implements BuildAssistantProvider {
  public calls: BuildAssistantGenerationInput[] = [];

  public async generate(
    input: BuildAssistantGenerationInput,
  ): Promise<BuildAssistantGeneration> {
    this.calls.push(input);
    return {
      content: "Start by testing the privacy boundary before adding the next feature.",
      insight: {
        question: "Which user data should never reach the model, and how will you test that boundary?",
        rationale: "The Build explicitly prioritizes private user data.",
        capabilitySlug: capability.slug,
      },
      inference: {
        capabilitySlug: capability.slug,
        inferredLevel: "intermediate" as const,
        rationale: "The question compares an architectural constraint with a testable boundary.",
        dimensions: ["reasoning", "tradeoff"],
      },
      mode: "model" as const,
      model: "test-model",
      providerResponseId: "response-test",
      inputTokens: 12,
      outputTokens: 34,
    };
  }
}

async function withApi<T>(
  builds: BuildBriefRepository,
  conversations: BuildConversationRepository,
  provider: BuildAssistantProvider,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createApp(testConfig, {
    accessTokenVerifier: configuredVerifier(),
    buildBriefRepository: builds,
    buildConversationRepository: conversations,
    buildAssistantProvider: provider,
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

test("a Build Companion message persists private context, insight, and only an unverified inference", async () => {
  const conversations = new InMemoryConversationRepository();
  const provider = new StubAssistantProvider();

  await withApi(buildRepository(), conversations, provider, async (baseUrl) => {
    const initial = await fetch(
      `${baseUrl}/api/v1/builds/${buildBrief.id}/conversation`,
      { headers: { Authorization: "Bearer test-token" } },
    );
    assert.equal(initial.status, 200);
    assert.deepEqual(await initial.json(), {
      data: {
        conversation: {
          buildId: buildBrief.id,
          status: "active",
          lastMessageAt: null,
          messages: [],
          latestInsight: null,
        },
      },
    });

    const response = await fetch(
      `${baseUrl}/api/v1/builds/${buildBrief.id}/conversation`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "How should I test the privacy boundary before the AI feature reaches users?",
          idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json() as {
      data: {
        userMessage: BuildConversationMessageDto;
        assistantMessage: BuildConversationMessageDto;
        insight: BuildInsightDto | null;
        inference: QuestionAnalysisDto | null;
        inferenceRecord: ChatSkillInferenceDto | null;
      };
    };
    assert.equal(body.data.userMessage.role, "user");
    assert.equal(body.data.assistantMessage.role, "assistant");
    assert.equal(body.data.assistantMessage.inReplyToMessageId, body.data.userMessage.id);
    assert.equal(body.data.assistantMessage.mode, "model");
    assert.equal(body.data.insight?.capabilitySlug, capability.slug);
    assert.equal(body.data.insight?.whyNow, body.data.insight?.rationale);
    assert.equal(body.data.inference?.inferredSkills[0]?.status, "unverified");
    assert.equal(body.data.inference?.inferredSkills[0]?.level, "novice");
    assert.equal(body.data.inferenceRecord?.proofStatus, "unverified_estimate");
    assert.equal(body.data.inferenceRecord?.visibility, "private");
    assert.equal(body.data.inferenceRecord?.estimatedLevel, "novice");
  });

  assert.equal(provider.calls.length, 1);
  assert.ok(
    provider.calls[0]?.messages.some((message) => message.role === "user"),
    "the model receives the current private Build thread",
  );
  assert.ok(conversations.getLimits.includes(10), "chat context is bounded to ten messages");
  assert.equal(conversations.startRunInputs.length, 1);
  assert.equal(conversations.completedRunInputs.length, 1);
  assert.equal(conversations.recordInferenceCalls, 1);
  assert.equal("messageContent" in conversations.startRunInputs[0]!.requestMetadata, false);
});

test("a duplicate message idempotency key returns the persisted reply without another model call", async () => {
  const conversations = new InMemoryConversationRepository();
  const provider = new StubAssistantProvider();

  await withApi(buildRepository(), conversations, provider, async (baseUrl) => {
    const request = () => fetch(
      `${baseUrl}/api/v1/builds/${buildBrief.id}/conversation/messages`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "How should I sequence the privacy checks?",
          idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      },
    );

    const first = await request();
    const firstBody = await first.json() as { data: { assistantMessage: BuildConversationMessageDto } };
    const second = await request();
    const secondBody = await second.json() as { data: { assistantMessage: BuildConversationMessageDto } };

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(secondBody.data.assistantMessage.id, firstBody.data.assistantMessage.id);
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(conversations.recordInferenceCalls, 1);
});

test("a non-owned Build is indistinguishable from a missing one and never invokes the assistant", async () => {
  const conversations = new InMemoryConversationRepository();
  const provider = new StubAssistantProvider();

  await withApi(buildRepository(false), conversations, provider, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/builds/${buildBrief.id}/conversation/messages`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "Can I test the next privacy decision?" }),
      },
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: "BUILD_NOT_FOUND", message: "Build Brief not found." },
    });
  });

  assert.equal(provider.calls.length, 0);
  assert.equal(conversations.getLimits.length, 0);
});

test("the Build skill overview is owner-scoped and returns the private current estimate contract", async () => {
  const conversations = new InMemoryConversationRepository();
  const provider = new StubAssistantProvider();

  await withApi(buildRepository(), conversations, provider, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/builds/${buildBrief.id}/skill-overview`,
      { headers: { Authorization: "Bearer test-token" } },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      data: {
        skillProfiles: [{
          capabilityId: capability.id,
          capabilitySlug: capability.slug,
          capabilityName: capability.name,
          level: "beginner",
          proofStatus: "unverified_estimate",
          assessmentBasis: "brief_derived",
        }],
      },
    });
  });

  await withApi(buildRepository(false), conversations, provider, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/builds/${buildBrief.id}/skill-overview`,
      { headers: { Authorization: "Bearer test-token" } },
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: "BUILD_NOT_FOUND", message: "Build Brief not found." },
    });
  });
});

test("the configured fallback is useful without an OpenAI key and never calls a network provider", async () => {
  const fallback = createBuildAssistantProvider(testConfig);
  const result = await fallback.generate({
    build: buildBrief,
    capabilities: [capability],
    messages: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        conversationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        buildId: buildBrief.id,
        role: "user",
        content: "How should I measure the privacy tradeoff before launching this feature?",
        inReplyToMessageId: null,
        mode: null,
        insight: null,
        createdAt: "2026-07-21T00:00:00.000Z",
      },
    ],
  });

  assert.equal(result.mode, "fallback");
  assert.equal(result.insight?.capabilitySlug, capability.slug);
  assert.equal(result.inference?.inferredLevel, "intermediate");
});

test("the no-key fallback persists a grounded signal only as a private unverified estimate", async () => {
  const conversations = new InMemoryConversationRepository();
  const provider = createBuildAssistantProvider(testConfig);

  await withApi(buildRepository(), conversations, provider, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/builds/${buildBrief.id}/conversation`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "How should I measure the privacy tradeoff before launching this feature?",
          idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        }),
      },
    );

    assert.equal(response.status, 200);
    const body = await response.json() as {
      data: {
        assistantMessage: BuildConversationMessageDto;
        inference: QuestionAnalysisDto | null;
        inferenceRecord: ChatSkillInferenceDto | null;
      };
    };

    assert.equal(body.data.assistantMessage.mode, "fallback");
    assert.equal(body.data.inference?.inferredSkills[0]?.status, "unverified");
    assert.equal(body.data.inferenceRecord?.proofStatus, "unverified_estimate");
    assert.equal(body.data.inferenceRecord?.visibility, "private");
  });

  assert.equal(conversations.recordInferenceCalls, 1);
});
