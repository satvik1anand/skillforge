import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";

import type { ServerConfig } from "../config/env.js";

const SUPABASE_AUTHENTICATED_AUDIENCE = "authenticated";
const SUPABASE_ACCESS_TOKEN_ALGORITHMS = ["ES256", "RS256"] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthenticatedRequestContext = Readonly<{
  userId: string;
  role: "authenticated";
  email?: string;
}>;

/** A small interface keeps route tests independent from remote JWKS fetching. */
export interface AccessTokenVerifier {
  readonly isConfigured: boolean;
  verifyAccessToken(accessToken: string): Promise<AuthenticatedRequestContext>;
}

export class AuthenticationConfigurationError extends Error {
  public constructor() {
    super("Authentication is not configured.");
    this.name = "AuthenticationConfigurationError";
  }
}

export class AccessTokenVerificationError extends Error {
  public constructor() {
    super("Access token verification failed.");
    this.name = "AccessTokenVerificationError";
  }
}

/**
 * The token may be sound while the remote signing-key provider is unavailable.
 * Keep this distinct from an invalid credential so callers can retry instead
 * of being told to sign in again during a provider outage.
 */
export class AuthenticationProviderUnavailableError extends Error {
  public constructor() {
    super("Authentication signing keys are temporarily unavailable.");
    this.name = "AuthenticationProviderUnavailableError";
  }
}

class UnconfiguredAccessTokenVerifier implements AccessTokenVerifier {
  public readonly isConfigured = false;

  public async verifyAccessToken(): Promise<AuthenticatedRequestContext> {
    throw new AuthenticationConfigurationError();
  }
}

class SupabaseJwksAccessTokenVerifier implements AccessTokenVerifier {
  public readonly isConfigured = true;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  public constructor(config: Required<Pick<ServerConfig, "supabaseIssuer" | "supabaseJwksUrl">>) {
    this.issuer = config.supabaseIssuer;
    // The JWKS contains public keys only. jose caches it in-process while still
    // respecting key IDs, so this supports Supabase signing-key rotation.
    this.jwks = createRemoteJWKSet(new URL(config.supabaseJwksUrl), {
      cacheMaxAge: 600_000,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
  }

  public async verifyAccessToken(
    accessToken: string,
  ): Promise<AuthenticatedRequestContext> {
    try {
      const { payload } = await jwtVerify(accessToken, this.jwks, {
        algorithms: [...SUPABASE_ACCESS_TOKEN_ALGORITHMS],
        audience: SUPABASE_AUTHENTICATED_AUDIENCE,
        issuer: this.issuer,
        requiredClaims: ["aud", "exp", "iss", "role", "sub"],
        clockTolerance: 5,
      });

      return toAuthenticatedRequestContext(payload);
    } catch (error) {
      if (isJwksAvailabilityFailure(error)) {
        throw new AuthenticationProviderUnavailableError();
      }

      if (error instanceof AccessTokenVerificationError) {
        throw error;
      }

      // Token and verifier errors intentionally collapse to one safe failure.
      // This prevents a caller from learning key, claim, or signature details.
      throw new AccessTokenVerificationError();
    }
  }
}

function isJwksAvailabilityFailure(error: unknown): boolean {
  // `jose` uses these errors when fetching or parsing the provider's key set.
  // A `TypeError` at this point comes from the platform fetch implementation:
  // configuration URLs are validated at startup and token parsing errors are
  // represented by JOSE errors, so it is safe to treat it as a retryable
  // provider/network failure rather than an invalid user credential.
  return (
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid ||
    error instanceof TypeError
  );
}

function toAuthenticatedRequestContext(
  payload: JWTPayload,
): AuthenticatedRequestContext {
  if (typeof payload.sub !== "string" || !UUID_PATTERN.test(payload.sub)) {
    throw new AccessTokenVerificationError();
  }

  if (payload.role !== "authenticated") {
    throw new AccessTokenVerificationError();
  }

  const email = typeof payload.email === "string" && payload.email.trim()
    ? payload.email
    : undefined;

  return {
    userId: payload.sub,
    role: "authenticated",
    ...(email ? { email } : {}),
  };
}

/**
 * Builds a verifier only when a Supabase project URL is present. The issuer
 * and JWKS URL both come from trusted server configuration, never a request.
 */
export function createAccessTokenVerifier(config: ServerConfig): AccessTokenVerifier {
  if (!config.supabaseIssuer || !config.supabaseJwksUrl) {
    return new UnconfiguredAccessTokenVerifier();
  }

  return new SupabaseJwksAccessTokenVerifier({
    supabaseIssuer: config.supabaseIssuer,
    supabaseJwksUrl: config.supabaseJwksUrl,
  });
}
