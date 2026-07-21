import type { RequestHandler } from "express";

import {
  type AccessTokenVerifier,
  AuthenticationConfigurationError,
  AuthenticationProviderUnavailableError,
} from "../auth/access-token-verifier.js";
import { ApiError } from "./error-handler.js";

const BEARER_TOKEN_PATTERN = /^Bearer\s+([^\s]+)$/i;
const MAX_ACCESS_TOKEN_LENGTH = 16_384;

function getBearerToken(authorization: string | undefined): string | undefined {
  const match = authorization ? BEARER_TOKEN_PATTERN.exec(authorization) : undefined;
  const accessToken = match?.[1];

  return accessToken && accessToken.length <= MAX_ACCESS_TOKEN_LENGTH
    ? accessToken
    : undefined;
}

/**
 * Adds a verified, minimal auth context to the request. It never trusts JWT
 * contents until the injected verifier has checked its signature and claims.
 */
export function createAuthenticationMiddleware(
  accessTokenVerifier: AccessTokenVerifier,
): RequestHandler {
  return async (request, _response, next) => {
    if (!accessTokenVerifier.isConfigured) {
      next(
        new ApiError(
          503,
          "AUTHENTICATION_UNAVAILABLE",
          "Authentication is currently unavailable.",
          { expose: true },
        ),
      );
      return;
    }

    const accessToken = getBearerToken(request.get("authorization"));

    if (!accessToken) {
      next(
        new ApiError(401, "UNAUTHORIZED", "Authentication is required."),
      );
      return;
    }

    try {
      request.auth = await accessTokenVerifier.verifyAccessToken(accessToken);
      next();
    } catch (error) {
      if (
        error instanceof AuthenticationConfigurationError ||
        error instanceof AuthenticationProviderUnavailableError
      ) {
        next(
          new ApiError(
            503,
            "AUTHENTICATION_UNAVAILABLE",
            "Authentication is currently unavailable.",
            { expose: true },
          ),
        );
        return;
      }

      // Missing, malformed, expired, and invalid tokens all use the same
      // response so the API does not disclose authentication internals.
      next(new ApiError(401, "UNAUTHORIZED", "Authentication is required."));
    }
  };
}
