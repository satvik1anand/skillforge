import { z } from "zod";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-20b:free";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const webUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "must use http or https");

const optionalOrigin = z.preprocess(
  emptyStringToUndefined,
  webUrl
    .refine((value) => {
      const url = new URL(value);
      return (
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      );
    }, "must be an origin without a path, query string, or fragment")
    .transform((value) => new URL(value).origin)
    .optional(),
);

const optionalSecret = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalModelName = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).max(200).optional(),
);

const optionalJwksUrl = z.preprocess(
  emptyStringToUndefined,
  webUrl
    .refine((value) => {
      const url = new URL(value);
      return !url.search && !url.hash && !url.username && !url.password;
    }, "must not include credentials, a query string, or a fragment")
    .transform((value) => new URL(value).toString())
    .optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  FRONTEND_URL: optionalOrigin,
  SUPABASE_URL: optionalOrigin,
  SUPABASE_SECRET_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  SUPABASE_JWKS_URL: optionalJwksUrl,
  OPENAI_API_KEY: optionalSecret,
  OPENROUTER_API_KEY: optionalSecret,
  OPENROUTER_MODEL: optionalModelName,
});

export type ServerConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  frontendUrl?: string;
  supabaseUrl?: string;
  supabaseIssuer?: string;
  /**
   * Server-only elevated key. Modern Supabase projects call this an
   * `sb_secret_...` key; the legacy service-role variable is accepted only as
   * a migration path for existing projects.
   */
  supabaseSecretKey?: string;
  supabaseJwksUrl?: string;
  openAiApiKey?: string;
  openRouterApiKey?: string;
  /** Defaults to `openai/gpt-oss-20b:free` when OpenRouter is configured. */
  openRouterModel?: string;
};

export type ConfigurationReadiness = {
  api: "ready";
  frontend: "configured" | "not_configured";
  supabase: "configured" | "not_configured";
  authentication: "configured" | "not_configured";
  ai: "configured" | "not_configured";
};

export class EnvironmentValidationError extends Error {
  public readonly issues: string[];

  public constructor(issues: string[]) {
    super("Invalid server environment configuration.");
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

/**
 * Parses only the variables the API owns. Missing third-party credentials are
 * intentionally allowed at this stage so the public health endpoint remains
 * usable before a deployment is connected to Supabase and OpenAI.
 */
export function loadServerConfig(source: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    throw new EnvironmentValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const env = result.data;
  const coherenceIssues: string[] = [];

  if (env.SUPABASE_JWKS_URL && !env.SUPABASE_URL) {
    coherenceIssues.push("SUPABASE_JWKS_URL requires SUPABASE_URL to establish the token issuer.");
  }

  if (env.SUPABASE_SECRET_KEY && env.SUPABASE_SERVICE_ROLE_KEY) {
    coherenceIssues.push(
      "Configure only SUPABASE_SECRET_KEY. SUPABASE_SERVICE_ROLE_KEY is a legacy fallback for existing projects.",
    );
  }

  const supabaseSecretKey =
    env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseSecretKey && !env.SUPABASE_URL) {
    coherenceIssues.push("A Supabase server key requires SUPABASE_URL.");
  }

  if (source.SUPABASE_JWT_SECRET?.trim()) {
    coherenceIssues.push(
      "SUPABASE_JWT_SECRET is not supported. Configure Supabase asymmetric signing keys and JWKS verification instead.",
    );
  }

  if (
    env.NODE_ENV === "production" &&
    [env.FRONTEND_URL, env.SUPABASE_URL, env.SUPABASE_JWKS_URL].some(
      (value) => value?.startsWith("http://"),
    )
  ) {
    coherenceIssues.push(
      "Frontend and Supabase authentication URLs must use https in production.",
    );
  }

  if (coherenceIssues.length > 0) {
    throw new EnvironmentValidationError(coherenceIssues);
  }

  const supabaseIssuer = env.SUPABASE_URL
    ? new URL("/auth/v1", env.SUPABASE_URL).toString()
    : undefined;
  const supabaseJwksUrl = env.SUPABASE_URL
    ? env.SUPABASE_JWKS_URL ??
      new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL).toString()
    : undefined;

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    frontendUrl: env.FRONTEND_URL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseIssuer,
    supabaseSecretKey,
    supabaseJwksUrl,
    openAiApiKey: env.OPENAI_API_KEY,
    openRouterApiKey: env.OPENROUTER_API_KEY,
    openRouterModel: env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
  };
}

/**
 * This shape is safe to expose from /health: it contains no URLs, key names,
 * secret values, model names, or other deployment identifiers.
 */
export function getConfigurationReadiness(
  config: ServerConfig,
): ConfigurationReadiness {
  return {
    api: "ready",
    frontend: config.frontendUrl ? "configured" : "not_configured",
    supabase:
      config.supabaseUrl && config.supabaseSecretKey
        ? "configured"
        : "not_configured",
    authentication:
      config.supabaseIssuer && config.supabaseJwksUrl
        ? "configured"
        : "not_configured",
    ai: config.openAiApiKey || config.openRouterApiKey
      ? "configured"
      : "not_configured",
  };
}
