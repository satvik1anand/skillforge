import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import {
  createAccessTokenVerifier,
  type AccessTokenVerifier,
} from "./auth/access-token-verifier.js";
import { type ServerConfig } from "./config/env.js";
import { createAuthenticationMiddleware } from "./middleware/auth.middleware.js";
import {
  ApiError,
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.js";
import { createAuthRouter } from "./routes/auth.js";
import { createBuildsRouter } from "./routes/builds.js";
import { createHealthRouter } from "./routes/health.js";
import {
  createBuildBriefRepository,
  type BuildBriefRepository,
} from "./repositories/build-brief.repository.js";
import {
  createEvidenceCardRepository,
  type EvidenceCardRepository,
} from "./repositories/evidence-card.repository.js";
import {
  createBuildConversationRepository,
  type BuildConversationRepository,
} from "./repositories/build-conversation.repository.js";
import {
  createBuildAssistantProvider,
  type BuildAssistantProvider,
} from "./services/build-assistant.service.js";

export type AppDependencies = {
  accessTokenVerifier?: AccessTokenVerifier;
  buildBriefRepository?: BuildBriefRepository;
  evidenceCardRepository?: EvidenceCardRepository;
  buildConversationRepository?: BuildConversationRepository;
  buildAssistantProvider?: BuildAssistantProvider;
};

function isAllowedOrigin(origin: string, config: ServerConfig): boolean {
  const configuredOrigins = [
    config.frontendUrl,
    ...(config.frontendAdditionalOrigins ?? []),
  ].filter((value): value is string => Boolean(value));

  if (configuredOrigins.length > 0) {
    return configuredOrigins.includes(origin);
  }

  // Fail closed for browser clients when a production deployment has not set
  // its frontend origin. Local development remains convenient without being a
  // production default.
  return config.nodeEnv !== "production" && origin === "http://localhost:3000";
}

export function createApp(
  config: ServerConfig,
  dependencies: AppDependencies = {},
): Express {
  const app = express();
  const accessTokenVerifier =
    dependencies.accessTokenVerifier ?? createAccessTokenVerifier(config);
  const requireAuthentication = createAuthenticationMiddleware(accessTokenVerifier);
  const buildBriefRepository =
    dependencies.buildBriefRepository ?? createBuildBriefRepository(config);
  const evidenceCardRepository =
    dependencies.evidenceCardRepository ?? createEvidenceCardRepository(config);
  const buildConversationRepository =
    dependencies.buildConversationRepository
    ?? createBuildConversationRepository(config);
  const buildAssistantProvider =
    dependencies.buildAssistantProvider ?? createBuildAssistantProvider(config);

  app.disable("x-powered-by");
  app.use(helmet());

  // Health must be available before third-party credentials and browser CORS
  // are configured, so deployment probes can report readiness accurately.
  app.use("/health", createHealthRouter(config));

  app.use(
    cors({
      origin(origin, callback) {
        // Server-to-server probes and same-origin requests do not send Origin.
        if (!origin) {
          callback(null, true);
          return;
        }

        if (isAllowedOrigin(origin, config)) {
          callback(null, true);
          return;
        }

        callback(
          new ApiError(
            403,
            "CORS_ORIGIN_DENIED",
            "This origin is not allowed to call the API.",
          ),
        );
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 86_400,
    }),
  );
  app.use(express.json({ limit: "1mb", strict: true }));
  app.use(
    "/api/v1/auth",
    createAuthRouter(requireAuthentication),
  );
  app.use(
    "/api/v1/builds",
    createBuildsRouter(
      requireAuthentication,
      buildBriefRepository,
      evidenceCardRepository,
      buildConversationRepository,
      buildAssistantProvider,
    ),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
