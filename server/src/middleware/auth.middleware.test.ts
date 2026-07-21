import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import {
  type AccessTokenVerifier,
  AccessTokenVerificationError,
  AuthenticationProviderUnavailableError,
  type AuthenticatedRequestContext,
} from "../auth/access-token-verifier.js";
import { createApp } from "../app.js";
import {
  DEFAULT_OPENROUTER_MODEL,
  EnvironmentValidationError,
  getConfigurationReadiness,
  loadServerConfig,
  type ServerConfig,
} from "../config/env.js";

const testConfig: ServerConfig = {
  nodeEnv: "test",
  port: 0,
  frontendUrl: "http://localhost:3000",
};

const user: AuthenticatedRequestContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
  email: "builder@example.com",
};

function configuredVerifier(
  verifyAccessToken: AccessTokenVerifier["verifyAccessToken"] = async () => user,
): AccessTokenVerifier {
  return {
    isConfigured: true,
    verifyAccessToken,
  };
}

async function withApi<T>(
  verifier: AccessTokenVerifier,
  callback: (baseUrl: string) => Promise<T>,
  config: ServerConfig = testConfig,
): Promise<T> {
  const server = createApp(config, { accessTokenVerifier: verifier }).listen(
    0,
    "127.0.0.1",
  );

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

test("authenticated identity route returns only verified request context", async () => {
  const response = await withApi(configuredVerifier(), (baseUrl) =>
    fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: "Bearer a-test-token" },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      user: {
        id: user.userId,
        role: user.role,
        email: user.email,
      },
    },
  });
});

test("identity route uses one generic response for missing or invalid tokens", async () => {
  const missing = await withApi(configuredVerifier(), (baseUrl) =>
    fetch(`${baseUrl}/api/v1/auth/me`),
  );
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), {
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    },
  });

  const invalid = await withApi(
    configuredVerifier(async () => {
      throw new AccessTokenVerificationError();
    }),
    (baseUrl) =>
      fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: "Bearer a-test-token" },
      }),
  );
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), {
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    },
  });
});

test("unconfigured authentication is an explicit service-unavailable state", async () => {
  const response = await withApi(
    {
      isConfigured: false,
      async verifyAccessToken() {
        throw new Error("This verifier should not be called.");
      },
    },
    (baseUrl) => fetch(`${baseUrl}/api/v1/auth/me`),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "AUTHENTICATION_UNAVAILABLE",
      message: "Authentication is currently unavailable.",
    },
  });
});

test("a signing-key provider outage is retryable rather than a false invalid-token response", async () => {
  const response = await withApi(
    configuredVerifier(async () => {
      throw new AuthenticationProviderUnavailableError();
    }),
    (baseUrl) =>
      fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: "Bearer a-test-token" },
      }),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "AUTHENTICATION_UNAVAILABLE",
      message: "Authentication is currently unavailable.",
    },
  });
});

test("server configuration derives the JWKS endpoint and uses one server-only Supabase key", () => {
  const derived = loadServerConfig({
    SUPABASE_URL: "https://example.supabase.co",
  });

  assert.equal(derived.supabaseIssuer, "https://example.supabase.co/auth/v1");
  assert.equal(
    derived.supabaseJwksUrl,
    "https://example.supabase.co/auth/v1/.well-known/jwks.json",
  );

  const modernKey = loadServerConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test-only-value",
  });

  assert.equal(modernKey.supabaseSecretKey, "sb_secret_test-only-value");

  const legacyKey = loadServerConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "legacy-test-only-value",
  });

  assert.equal(legacyKey.supabaseSecretKey, "legacy-test-only-value");

  assert.throws(
    () =>
      loadServerConfig({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test-only-value",
        SUPABASE_SERVICE_ROLE_KEY: "legacy-test-only-value",
      }),
    EnvironmentValidationError,
  );

  const multipleFrontendOrigins = loadServerConfig({
    NODE_ENV: "production",
    FRONTEND_URL: "https://app.skillforge.example",
    FRONTEND_ADDITIONAL_ORIGINS:
      "https://portfolio.skillforge.example, https://demo.skillforge.example",
  });
  assert.deepEqual(multipleFrontendOrigins.frontendAdditionalOrigins, [
    "https://portfolio.skillforge.example",
    "https://demo.skillforge.example",
  ]);

  assert.throws(
    () =>
      loadServerConfig({
        FRONTEND_ADDITIONAL_ORIGINS: "https://app.skillforge.example/not-an-origin",
      }),
    EnvironmentValidationError,
  );

  assert.throws(
    () =>
      loadServerConfig({
        SUPABASE_JWT_SECRET: "legacy-secret-should-never-be-used",
      }),
    EnvironmentValidationError,
  );

  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: "production",
        FRONTEND_URL: "http://app.skillforge.example",
      }),
    EnvironmentValidationError,
  );

  const openRouter = loadServerConfig({
    OPENROUTER_API_KEY: "router-test-only-value",
  });
  assert.equal(openRouter.openRouterApiKey, "router-test-only-value");
  assert.equal(openRouter.openRouterModel, DEFAULT_OPENROUTER_MODEL);
  assert.equal(getConfigurationReadiness(openRouter).ai, "configured");

  const customOpenRouter = loadServerConfig({
    OPENROUTER_API_KEY: "router-test-only-value",
    OPENROUTER_MODEL: "provider/custom-model",
  });
  assert.equal(customOpenRouter.openRouterModel, "provider/custom-model");
  assert.equal(getConfigurationReadiness(loadServerConfig({})).ai, "not_configured");
});

test("CORS permits only the configured exact frontend origins", async () => {
  const config: ServerConfig = {
    ...testConfig,
    nodeEnv: "production",
    frontendUrl: "https://app.skillforge.example",
    frontendAdditionalOrigins: ["https://portfolio.skillforge.example"],
  };

  const allowed = await withApi(
    configuredVerifier(),
    (baseUrl) =>
      fetch(`${baseUrl}/api/v1/does-not-exist`, {
        headers: { Origin: "https://portfolio.skillforge.example" },
      }),
    config,
  );
  assert.equal(allowed.status, 404);
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "https://portfolio.skillforge.example",
  );

  const denied = await withApi(
    configuredVerifier(),
    (baseUrl) =>
      fetch(`${baseUrl}/api/v1/does-not-exist`, {
        headers: { Origin: "https://unconfigured.skillforge.example" },
      }),
    config,
  );
  assert.equal(denied.status, 403);
});
