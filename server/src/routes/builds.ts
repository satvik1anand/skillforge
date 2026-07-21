import { Router, type Request, type RequestHandler, type Response } from "express";

import {
  buildBriefListQuerySchema,
  buildIdParamsSchema,
  createBuildBriefRequestSchema,
  updateBuildBriefRequestSchema,
} from "../contracts/build-brief.contract.js";
import { buildConversationParamsSchema } from "../contracts/build-conversation.contract.js";
import { ApiError } from "../middleware/error-handler.js";
import {
  BuildBriefPersistenceUnavailableError,
  type BuildBriefRepository,
} from "../repositories/build-brief.repository.js";
import { type BuildConversationRepository } from "../repositories/build-conversation.repository.js";
import { type EvidenceCardRepository } from "../repositories/evidence-card.repository.js";
import { type BuildAssistantProvider } from "../services/build-assistant.service.js";
import { createBuildConversationRouter } from "./build-conversation.js";
import { createEvidenceCardsRouter } from "./evidence-cards.js";

export function createBuildsRouter(
  requireAuthentication: RequestHandler,
  repository: BuildBriefRepository,
  evidenceCardRepository: EvidenceCardRepository,
  conversationRepository: BuildConversationRepository,
  assistantProvider: BuildAssistantProvider,
): Router {
  const router = Router();

  router.use(requireAuthentication);
  // Keep authentication first: an anonymous caller should not learn whether a
  // deployment has connected its persistence layer.
  router.use((_request, _response, next) => {
    if (!repository.isConfigured) {
      next(persistenceUnavailable());
      return;
    }

    next();
  });

  router.use(
    "/:buildId/evidence-cards",
    createEvidenceCardsRouter(repository, evidenceCardRepository),
  );
  router.use(
    "/:buildId/conversation",
    createBuildConversationRouter(
      repository,
      conversationRepository,
      assistantProvider,
    ),
  );

  router.get("/", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const query = parseBuildBriefListQuery(request);
      const items = await repository.list(auth.userId, query);

      sendPrivate(response, 200, { data: { items } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const input = createBuildBriefRequestSchema.parse(request.body);
      const buildBrief = await repository.create(auth.userId, input);

      sendPrivate(response, 201, { data: { buildBrief } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  router.get("/:buildId/skill-overview", async (request, response, next) => {
    try {
      if (!conversationRepository.isConfigured) {
        throw persistenceUnavailable();
      }

      const auth = getAuthenticatedUser(request);
      const { buildId } = buildConversationParamsSchema.parse(request.params);
      const buildBrief = await repository.findById(auth.userId, buildId);
      if (!buildBrief) {
        throw buildNotFound();
      }

      const skillProfiles = await conversationRepository.listSkillOverview(
        auth.userId,
        buildBrief.primaryContextPack,
      );
      sendPrivate(response, 200, { data: { skillProfiles } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { id } = buildIdParamsSchema.parse(request.params);
      const buildBrief = await repository.findById(auth.userId, id);

      if (!buildBrief) {
        throw buildNotFound();
      }

      sendPrivate(response, 200, { data: { buildBrief } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { id } = buildIdParamsSchema.parse(request.params);
      const input = updateBuildBriefRequestSchema.parse(request.body);
      const result = await repository.update(auth.userId, id, input);

      if (result.kind === "not_found") {
        throw buildNotFound();
      }

      if (result.kind === "revision_conflict") {
        throw new ApiError(
          409,
          "BUILD_BRIEF_REVISION_CONFLICT",
          "This Build Brief changed. Refresh and try again.",
        );
      }

      sendPrivate(response, 200, { data: { buildBrief: result.buildBrief } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  return router;
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

function buildNotFound(): ApiError {
  // A non-owned resource is indistinguishable from a missing one.
  return new ApiError(404, "BUILD_NOT_FOUND", "Build Brief not found.");
}

function parseBuildBriefListQuery(
  request: Request,
): ReturnType<typeof buildBriefListQuerySchema.parse> {
  const rawLimit = request.query.limit;
  const rawStatus = request.query.status;

  if (
    (rawLimit !== undefined && typeof rawLimit !== "string") ||
    (rawStatus !== undefined && typeof rawStatus !== "string")
  ) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "One or more request values are invalid.",
    );
  }

  if (rawLimit !== undefined && !/^[1-9][0-9]*$/.test(rawLimit)) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "One or more request values are invalid.",
    );
  }

  return buildBriefListQuerySchema.parse({
    ...(rawLimit === undefined ? {} : { limit: Number(rawLimit) }),
    ...(rawStatus === undefined ? {} : { status: rawStatus }),
  });
}

function toRouteError(error: unknown): unknown {
  if (error instanceof BuildBriefPersistenceUnavailableError) {
    return persistenceUnavailable();
  }

  return error;
}

function persistenceUnavailable(): ApiError {
  return new ApiError(
    503,
    "PERSISTENCE_UNAVAILABLE",
    "Build storage is currently unavailable.",
    { expose: true },
  );
}

function sendPrivate(response: Response, status: number, body: unknown): void {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}
