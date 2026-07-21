import { Router, type Request, type Response } from "express";

import type { BuildBriefDto } from "../contracts/build-brief.contract.js";
import {
  buildConversationParamsSchema,
  buildConversationQuerySchema,
  createBuildConversationMessageRequestSchema,
  type BuildCapabilityDto,
  type BuildConversationDto,
  type BuildConversationMessageDto,
  type BuildInsightDto,
  type ChatSkillInferenceDto,
  type QuestionAnalysisDto,
} from "../contracts/build-conversation.contract.js";
import { ApiError } from "../middleware/error-handler.js";
import {
  BuildBriefPersistenceUnavailableError,
  type BuildBriefRepository,
} from "../repositories/build-brief.repository.js";
import {
  BuildConversationPersistenceError,
  BuildConversationPersistenceUnavailableError,
  contentFingerprint,
  type BuildConversationRepository,
} from "../repositories/build-conversation.repository.js";
import {
  BUILD_ASSISTANT_PROMPT_VERSION,
  type BuildAssistantGeneration,
  type BuildAssistantProvider,
} from "../services/build-assistant.service.js";

const CONTEXT_MESSAGE_LIMIT = 10;

/**
 * Nested owner-scoped Build Companion routes. The parent Build router has
 * already authenticated the request and verified Build Brief persistence.
 */
export function createBuildConversationRouter(
  buildBriefRepository: BuildBriefRepository,
  conversationRepository: BuildConversationRepository,
  assistantProvider: BuildAssistantProvider,
): Router {
  const router = Router({ mergeParams: true });

  router.use((_request, _response, next) => {
    if (!conversationRepository.isConfigured) {
      next(persistenceUnavailable());
      return;
    }
    next();
  });

  router.get("/", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { buildId } = buildConversationParamsSchema.parse(request.params);
      const query = parseConversationQuery(request);
      await requireOwnedBuild(buildBriefRepository, auth.userId, buildId);
      const snapshot = await conversationRepository.getConversation(
        auth.userId,
        buildId,
        query.limit ?? 50,
      );
      const messages = await attachMessageAnalysis(
        conversationRepository,
        auth.userId,
        buildId,
        snapshot.messages,
      );

      sendPrivate(response, 200, {
        data: {
          conversation: toConversationDto(snapshot.conversation, messages, buildId),
        },
      });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  const postUserMessage = async (request: Request, response: Response, next: (error?: unknown) => void) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { buildId } = buildConversationParamsSchema.parse(request.params);
      const input = createBuildConversationMessageRequestSchema.parse(request.body);
      const build = await requireOwnedBuild(buildBriefRepository, auth.userId, buildId);
      const persistedUserMessage = await conversationRepository.persistUserMessage(
        auth.userId,
        buildId,
        input.content,
        input.idempotencyKey,
      );

      // A duplicate client retry returns the exact already-persisted reply and
      // does not make another model call or create another inference.
      const existingAssistantMessage = await conversationRepository.findAssistantReply(
        auth.userId,
        buildId,
        persistedUserMessage.conversation.id,
        persistedUserMessage.message.id,
      );
      if (existingAssistantMessage) {
        const inference = await conversationRepository.findInferenceBySourceMessage(
          auth.userId,
          buildId,
          persistedUserMessage.message.id,
        );
        sendMessageResult(
          response,
          persistedUserMessage.message,
          existingAssistantMessage,
          inference,
        );
        return;
      }

      const [contextSnapshot, capabilities] = await Promise.all([
        conversationRepository.getConversation(
          auth.userId,
          buildId,
          CONTEXT_MESSAGE_LIMIT,
        ),
        conversationRepository.listContextCapabilities(build.primaryContextPack),
      ]);
      const generation = await assistantProvider.generate({
        build,
        messages: contextSnapshot.messages,
        capabilities,
      });
      const normalizedGeneration = normalizeGeneration(generation, capabilities);

      // `ai_runs` stores only a one-way fingerprint and aggregate metadata;
      // the private message records are the only place raw working content is
      // retained. This applies to the deterministic fallback too so every
      // reply has the same audit boundary.
      const aiRunId = await conversationRepository.startAiRun(auth.userId, buildId, {
        idempotencyKey: `build-companion:${persistedUserMessage.message.id}`,
        inputFingerprint: contentFingerprint(
          JSON.stringify({
            buildId,
            conversationId: persistedUserMessage.conversation.id,
            userMessageId: persistedUserMessage.message.id,
            messageContent: persistedUserMessage.message.content,
            contextMessageIds: contextSnapshot.messages.map((message) => message.id),
            capabilityIds: capabilities.map((capability) => capability.id),
          }),
        ),
        model: normalizedGeneration.model,
        promptVersion: BUILD_ASSISTANT_PROMPT_VERSION,
        requestMetadata: {
          mode: normalizedGeneration.mode,
          contextMessageCount: contextSnapshot.messages.length,
          capabilityCount: capabilities.length,
        },
      });

      const inference = await persistInferenceIfGrounded(
        conversationRepository,
        auth.userId,
        buildId,
        persistedUserMessage.conversation.id,
        persistedUserMessage.message.id,
        capabilities,
        normalizedGeneration,
        aiRunId,
      );
      const assistantMessage = await conversationRepository.persistAssistantMessage(
        auth.userId,
        buildId,
        {
          conversationId: persistedUserMessage.conversation.id,
          replyToMessageId: persistedUserMessage.message.id,
          content: normalizedGeneration.content,
          insight: normalizedGeneration.insight,
          mode: normalizedGeneration.mode,
          aiRunId,
        },
      );
      await conversationRepository.completeAiRun(auth.userId, buildId, aiRunId, {
        responseFingerprint: contentFingerprint(
          JSON.stringify({
            assistantContent: assistantMessage.content,
            insight: assistantMessage.insight,
            inferenceId: inference?.id,
          }),
        ),
        providerResponseId: normalizedGeneration.providerResponseId,
        inputTokens: normalizedGeneration.inputTokens,
        outputTokens: normalizedGeneration.outputTokens,
        responseMetadata: {
          mode: normalizedGeneration.mode,
          hasInsight: normalizedGeneration.insight !== null,
          hasInference: inference !== undefined,
        },
      });

      sendMessageResult(
        response,
        persistedUserMessage.message,
        assistantMessage,
        inference,
      );
    } catch (error) {
      next(toRouteError(error));
    }
  };

  // `/conversation` is the primary UI contract. The explicit `/messages`
  // form remains as a stable API alias for callers that model messages as a
  // nested resource.
  router.post("/", postUserMessage);
  router.post("/messages", postUserMessage);

  return router;
}

function normalizeGeneration(
  generation: BuildAssistantGeneration,
  capabilities: readonly BuildCapabilityDto[],
): BuildAssistantGeneration {
  const allowedSlugs = new Set(capabilities.map((capability) => capability.slug));
  const insight = generation.insight && (
    generation.insight.capabilitySlug === undefined
    || allowedSlugs.has(generation.insight.capabilitySlug)
  )
    ? generation.insight
    : generation.insight
      ? {
          question: generation.insight.question,
          rationale: generation.insight.rationale,
        }
      : null;
  const inference = generation.inference && allowedSlugs.has(generation.inference.capabilitySlug)
    ? generation.inference
    : null;

  return { ...generation, insight, inference };
}

async function persistInferenceIfGrounded(
  repository: BuildConversationRepository,
  userId: string,
  buildId: string,
  conversationId: string,
  sourceMessageId: string,
  capabilities: readonly BuildCapabilityDto[],
  generation: BuildAssistantGeneration,
  aiRunId: string,
): Promise<ChatSkillInferenceDto | undefined> {
  if (!generation.inference) {
    return undefined;
  }

  const capability = capabilities.find(
    (candidate) => candidate.slug === generation.inference?.capabilitySlug,
  );
  if (!capability) {
    return undefined;
  }

  return repository.recordInference(
    userId,
    buildId,
    conversationId,
    sourceMessageId,
    capability,
    generation.inference,
    aiRunId,
  );
}

function toConversationDto(
  summary: {
    readonly id: string;
    readonly buildId: string;
    readonly status: "active" | "archived";
    readonly lastMessageAt: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
  } | undefined,
  messages: readonly BuildConversationMessageDto[],
  buildId: string,
): BuildConversationDto {
  if (!summary) {
    return {
      buildId,
      status: "active",
      lastMessageAt: null,
      messages: [],
      latestInsight: null,
    };
  }

  const clientMessages = messages.map((message) => message.insight
    ? { ...message, insight: toClientInsight(message.insight) }
    : message,
  );
  const latestInsight = [...clientMessages]
    .reverse()
    .find((message) => message.insight !== null)?.insight ?? null;
  return { ...summary, messages: clientMessages, latestInsight };
}

function sendMessageResult(
  response: Response,
  userMessage: BuildConversationMessageDto,
  assistantMessage: BuildConversationMessageDto,
  inference: ChatSkillInferenceDto | undefined,
): void {
  const analysis = inference ? toQuestionAnalysis(inference) : null;
  sendPrivate(response, 200, {
    data: {
      userMessage: analysis ? { ...userMessage, analysis } : userMessage,
      assistantMessage,
      insight: toClientInsight(assistantMessage.insight),
      inference: analysis,
      inferenceRecord: inference ?? null,
    },
  });
}

async function attachMessageAnalysis(
  repository: BuildConversationRepository,
  userId: string,
  buildId: string,
  messages: readonly BuildConversationMessageDto[],
): Promise<readonly BuildConversationMessageDto[]> {
  const entries = await Promise.all(messages.map(async (message) => {
    if (message.role !== "user") {
      return [message.id, undefined] as const;
    }
    const inference = await repository.findInferenceBySourceMessage(
      userId,
      buildId,
      message.id,
    );
    return [message.id, inference ? toQuestionAnalysis(inference) : undefined] as const;
  }));
  const analysisByMessageId = new Map(entries);

  return messages.map((message) => {
    const analysis = analysisByMessageId.get(message.id);
    return analysis ? { ...message, analysis } : message;
  });
}

function toQuestionAnalysis(inference: ChatSkillInferenceDto): QuestionAnalysisDto {
  return {
    inferredSkills: [
      {
        capabilityName: inference.capability.name,
        level: inference.estimatedLevel,
        status: "unverified",
        rationale: inference.rationale,
      },
    ],
  };
}

function toClientInsight(insight: BuildInsightDto | null): BuildInsightDto | null {
  return insight
    ? { ...insight, whyNow: insight.whyNow ?? insight.rationale }
    : null;
}

function getAuthenticatedUser(request: Request) {
  if (!request.auth) {
    throw new ApiError(
      500,
      "AUTH_CONTEXT_MISSING",
      "Authenticated request context is missing.",
      { expose: false },
    );
  }
  return request.auth;
}

async function requireOwnedBuild(
  repository: BuildBriefRepository,
  userId: string,
  buildId: string,
): Promise<BuildBriefDto> {
  const build = await repository.findById(userId, buildId);
  if (!build) {
    // A non-owned Build is intentionally indistinguishable from a missing one.
    throw new ApiError(404, "BUILD_NOT_FOUND", "Build Brief not found.");
  }
  return build;
}

function parseConversationQuery(
  request: Request,
): ReturnType<typeof buildConversationQuerySchema.parse> {
  const rawLimit = request.query.limit;
  if (rawLimit !== undefined && typeof rawLimit !== "string") {
    throw invalidRequest();
  }
  if (rawLimit !== undefined && !/^[1-9][0-9]*$/.test(rawLimit)) {
    throw invalidRequest();
  }
  return buildConversationQuerySchema.parse(
    rawLimit === undefined ? {} : { limit: Number(rawLimit) },
  );
}

function invalidRequest(): ApiError {
  return new ApiError(
    400,
    "INVALID_REQUEST",
    "One or more request values are invalid.",
  );
}

function toRouteError(error: unknown): unknown {
  if (
    error instanceof BuildBriefPersistenceUnavailableError
    || error instanceof BuildConversationPersistenceUnavailableError
  ) {
    return persistenceUnavailable();
  }
  if (error instanceof BuildConversationPersistenceError) {
    return new ApiError(
      500,
      "BUILD_COMPANION_PERSISTENCE_FAILED",
      "Build Companion storage could not complete the request.",
      { expose: false },
    );
  }
  return error;
}

function persistenceUnavailable(): ApiError {
  return new ApiError(
    503,
    "PERSISTENCE_UNAVAILABLE",
    "Build Companion storage is currently unavailable.",
    { expose: true },
  );
}

function sendPrivate(response: Response, status: number, body: unknown): void {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}
