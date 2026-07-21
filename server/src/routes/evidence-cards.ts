import { Router, type Request, type Response } from "express";

import {
  createManualEvidenceCardRequestSchema,
  evidenceBuildParamsSchema,
  evidenceCardListQuerySchema,
  evidenceCardParamsSchema,
  revokeEvidenceCardRequestSchema,
  transitionEvidenceCardRequestSchema,
} from "../contracts/evidence-card.contract.js";
import { ApiError } from "../middleware/error-handler.js";
import {
  BuildBriefPersistenceUnavailableError,
  type BuildBriefRepository,
} from "../repositories/build-brief.repository.js";
import {
  EvidenceCardPersistenceUnavailableError,
  type EvidenceCardRepository,
} from "../repositories/evidence-card.repository.js";

/**
 * Nested private evidence routes. The parent Build router has already verified
 * authentication and checked Build Brief persistence before this router runs.
 */
export function createEvidenceCardsRouter(
  buildBriefRepository: BuildBriefRepository,
  evidenceCardRepository: EvidenceCardRepository,
): Router {
  const router = Router({ mergeParams: true });

  router.use((_request, _response, next) => {
    if (!evidenceCardRepository.isConfigured) {
      next(persistenceUnavailable());
      return;
    }

    next();
  });

  router.get("/", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { buildId } = evidenceBuildParamsSchema.parse(request.params);
      const query = parseEvidenceCardListQuery(request);
      await requireOwnedBuild(buildBriefRepository, auth.userId, buildId);
      const items = await evidenceCardRepository.list(auth.userId, buildId, query);

      sendPrivate(response, 200, { data: { items } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { buildId } = evidenceBuildParamsSchema.parse(request.params);
      const input = createManualEvidenceCardRequestSchema.parse(request.body);
      await requireOwnedBuild(buildBriefRepository, auth.userId, buildId);
      const evidenceCard = await evidenceCardRepository.create(
        auth.userId,
        buildId,
        input,
      );

      sendPrivate(response, 201, { data: { evidenceCard } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  router.get("/:cardId", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { buildId, cardId } = evidenceCardParamsSchema.parse(request.params);
      await requireOwnedBuild(buildBriefRepository, auth.userId, buildId);
      const evidenceCard = await evidenceCardRepository.findById(
        auth.userId,
        buildId,
        cardId,
      );

      if (!evidenceCard) {
        throw evidenceCardNotFound();
      }

      sendPrivate(response, 200, { data: { evidenceCard } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  router.patch("/:cardId", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { buildId, cardId } = evidenceCardParamsSchema.parse(request.params);
      const input = transitionEvidenceCardRequestSchema.parse(request.body);
      await requireOwnedBuild(buildBriefRepository, auth.userId, buildId);
      const result = await evidenceCardRepository.transition(
        auth.userId,
        buildId,
        cardId,
        input.action,
      );

      if (result.kind === "not_found") {
        throw evidenceCardNotFound();
      }

      if (result.kind === "invalid_transition") {
        throw invalidTransition();
      }

      sendPrivate(response, 200, { data: { evidenceCard: result.evidenceCard } });
    } catch (error) {
      next(toRouteError(error));
    }
  });

  router.post("/:cardId/revoke", async (request, response, next) => {
    try {
      const auth = getAuthenticatedUser(request);
      const { buildId, cardId } = evidenceCardParamsSchema.parse(request.params);
      const input = revokeEvidenceCardRequestSchema.parse(
        request.body === undefined ? {} : request.body,
      );
      await requireOwnedBuild(buildBriefRepository, auth.userId, buildId);
      const result = await evidenceCardRepository.transition(
        auth.userId,
        buildId,
        cardId,
        "revoke",
        input.reason,
      );

      if (result.kind === "not_found") {
        throw evidenceCardNotFound();
      }

      if (result.kind === "invalid_transition") {
        throw invalidTransition();
      }

      sendPrivate(response, 200, { data: { evidenceCard: result.evidenceCard } });
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

async function requireOwnedBuild(
  repository: BuildBriefRepository,
  userId: string,
  buildId: string,
): Promise<void> {
  const buildBrief = await repository.findById(userId, buildId);
  if (!buildBrief) {
    // Missing and non-owned builds intentionally have the same response.
    throw new ApiError(404, "BUILD_NOT_FOUND", "Build Brief not found.");
  }
}

function evidenceCardNotFound(): ApiError {
  // Keep a non-owned card indistinguishable from a missing card.
  return new ApiError(404, "EVIDENCE_CARD_NOT_FOUND", "Evidence card not found.");
}

function invalidTransition(): ApiError {
  return new ApiError(
    409,
    "EVIDENCE_CARD_TRANSITION_CONFLICT",
    "This evidence record cannot take that action in its current state.",
  );
}

function parseEvidenceCardListQuery(
  request: Request,
): ReturnType<typeof evidenceCardListQuerySchema.parse> {
  const rawLimit = request.query.limit;
  const rawStatus = request.query.status;

  if (
    (rawLimit !== undefined && typeof rawLimit !== "string")
    || (rawStatus !== undefined && typeof rawStatus !== "string")
  ) {
    throw invalidRequest();
  }

  if (rawLimit !== undefined && !/^[1-9][0-9]*$/.test(rawLimit)) {
    throw invalidRequest();
  }

  return evidenceCardListQuerySchema.parse({
    ...(rawLimit === undefined ? {} : { limit: Number(rawLimit) }),
    ...(rawStatus === undefined ? {} : { status: rawStatus }),
  });
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
    || error instanceof EvidenceCardPersistenceUnavailableError
  ) {
    return persistenceUnavailable();
  }

  return error;
}

function persistenceUnavailable(): ApiError {
  return new ApiError(
    503,
    "PERSISTENCE_UNAVAILABLE",
    "Evidence storage is currently unavailable.",
    { expose: true },
  );
}

function sendPrivate(response: Response, status: number, body: unknown): void {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}
