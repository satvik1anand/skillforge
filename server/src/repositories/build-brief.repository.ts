import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { ServerConfig } from "../config/env.js";
import {
  buildBriefDtoSchema,
  type BuildBriefDto,
  type BuildBriefListQuery,
  type CreateBuildBriefRequest,
  type UpdateBuildBriefRequest,
} from "../contracts/build-brief.contract.js";

const BUILD_BRIEF_COLUMNS = [
  "id",
  "brief_version",
  "status",
  "title",
  "primary_context_pack",
  "outcome",
  "audience_or_stakeholder",
  "role_statement",
  "constraints_summary",
  "definition_of_done",
  "metric_label",
  "metric_unit",
  "baseline_value",
  "target_value",
  "timebox_ends_at",
  "evidence_capture_enabled",
  "created_at",
  "updated_at",
] as const;

const BUILD_BRIEF_SELECT = BUILD_BRIEF_COLUMNS.join(",");
const DEFAULT_LIST_LIMIT = 20;

export type BuildBriefUpdateResult =
  | { readonly kind: "updated"; readonly buildBrief: BuildBriefDto }
  | { readonly kind: "not_found" }
  | { readonly kind: "revision_conflict" };

/**
 * Persistence boundary for private Build Briefs. It is deliberately narrow so
 * route tests can provide an in-memory fake without a networked Supabase
 * project. Callers supply the verified user ID; request bodies never do.
 */
export interface BuildBriefRepository {
  readonly isConfigured: boolean;
  list(
    userId: string,
    query: BuildBriefListQuery,
  ): Promise<readonly BuildBriefDto[]>;
  findById(userId: string, buildId: string): Promise<BuildBriefDto | undefined>;
  create(
    userId: string,
    input: CreateBuildBriefRequest,
  ): Promise<BuildBriefDto>;
  update(
    userId: string,
    buildId: string,
    input: UpdateBuildBriefRequest,
  ): Promise<BuildBriefUpdateResult>;
}

/** A safe signal for configuration-gated routes; it never contains key data. */
export class BuildBriefPersistenceUnavailableError extends Error {
  public constructor() {
    super("Build Brief persistence is not configured.");
    this.name = "BuildBriefPersistenceUnavailableError";
  }
}

/**
 * This intentionally does not retain the underlying PostgREST error. The API
 * maps it to its generic internal-error response and never exposes database
 * implementation details or service-role credentials.
 */
export class BuildBriefPersistenceError extends Error {
  public constructor() {
    super("Build Brief persistence failed.");
    this.name = "BuildBriefPersistenceError";
  }
}

type BuildBriefWriteRow = Record<string, string | number | boolean | null>;

class UnconfiguredBuildBriefRepository implements BuildBriefRepository {
  public readonly isConfigured = false;

  public async list(): Promise<readonly BuildBriefDto[]> {
    throw new BuildBriefPersistenceUnavailableError();
  }

  public async findById(): Promise<BuildBriefDto | undefined> {
    throw new BuildBriefPersistenceUnavailableError();
  }

  public async create(): Promise<BuildBriefDto> {
    throw new BuildBriefPersistenceUnavailableError();
  }

  public async update(): Promise<BuildBriefUpdateResult> {
    throw new BuildBriefPersistenceUnavailableError();
  }
}

class SupabaseBuildBriefRepository implements BuildBriefRepository {
  public readonly isConfigured = true;

  public constructor(private readonly client: SupabaseClient) {}

  public async list(
    userId: string,
    query: BuildBriefListQuery,
  ): Promise<readonly BuildBriefDto[]> {
    const baseQuery = this.client
      .from("builds")
      .select(BUILD_BRIEF_SELECT)
      // Service-role access bypasses RLS. Every query repeats the user scope.
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const filteredQuery = query.status
      ? baseQuery.eq("status", query.status)
      : baseQuery;
    const { data, error } = await filteredQuery.limit(
      query.limit ?? DEFAULT_LIST_LIMIT,
    );

    if (error || !data) {
      throw new BuildBriefPersistenceError();
    }

    return data.map(toBuildBriefDto);
  }

  public async findById(
    userId: string,
    buildId: string,
  ): Promise<BuildBriefDto | undefined> {
    const { data, error } = await this.client
      .from("builds")
      .select(BUILD_BRIEF_SELECT)
      // Never look up a build by ID without its verified owner scope.
      .eq("id", buildId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // Keep database details out of API responses while retaining the small
      // amount of operator-safe metadata needed to diagnose a read failure.
      console.error(
        JSON.stringify({
          event: "build_brief_repository_error",
          operation: "find_by_id",
          providerCode: error.code ?? "unknown",
        }),
      );
      throw new BuildBriefPersistenceError();
    }

    if (!data) {
      return undefined;
    }

    try {
      return toBuildBriefDto(data);
    } catch (caught) {
      console.error(
        JSON.stringify({
          event: "build_brief_repository_error",
          operation: "find_by_id_dto",
          errorName: caught instanceof Error ? caught.name : typeof caught,
        }),
      );
      throw caught;
    }
  }

  public async create(
    userId: string,
    input: CreateBuildBriefRequest,
  ): Promise<BuildBriefDto> {
    const { data, error } = await this.client
      .from("builds")
      // The only user ID used for inserts comes from verified authentication.
      .insert(toCreateRow(userId, input))
      .select(BUILD_BRIEF_SELECT)
      .single();

    if (error || !data) {
      throw new BuildBriefPersistenceError();
    }

    return toBuildBriefDto(data);
  }

  public async update(
    userId: string,
    buildId: string,
    input: UpdateBuildBriefRequest,
  ): Promise<BuildBriefUpdateResult> {
    // This is an atomic optimistic-concurrency write: a stale revision does
    // not modify the record. The database migration does not auto-increment
    // `brief_version`, so the bounded next revision is written explicitly.
    const { data, error } = await this.client
      .from("builds")
      .update(toUpdateRow(input))
      .eq("id", buildId)
      .eq("user_id", userId)
      .eq("brief_version", input.expectedRevision)
      .select(BUILD_BRIEF_SELECT)
      .maybeSingle();

    if (error) {
      throw new BuildBriefPersistenceError();
    }

    if (data) {
      return { kind: "updated", buildBrief: toBuildBriefDto(data) };
    }

    // A miss can mean either a stale revision or a missing/non-owned build.
    // Resolve that distinction only within the same verified user scope.
    const existing = await this.findById(userId, buildId);
    return existing
      ? { kind: "revision_conflict" }
      : { kind: "not_found" };
  }
}

/**
 * Creates the BFF-only repository. It is intentionally unavailable unless
 * both halves of the server-only Supabase configuration are present; there is
 * no local-memory fallback or simulated persistence path.
 */
export function createBuildBriefRepository(
  config: ServerConfig,
): BuildBriefRepository {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    return new UnconfiguredBuildBriefRepository();
  }

  const client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return new SupabaseBuildBriefRepository(client);
}

function toCreateRow(
  userId: string,
  input: CreateBuildBriefRequest,
): BuildBriefWriteRow {
  return {
    user_id: userId,
    title: input.title,
    primary_context_pack: input.primaryContextPack,
    outcome: input.outcome,
    audience_or_stakeholder: input.audienceOrStakeholder ?? null,
    role_statement: input.roleStatement ?? null,
    constraints_summary: input.constraintsSummary ?? null,
    definition_of_done: input.definitionOfDone ?? null,
    metric_label: input.metric?.label ?? null,
    metric_unit: input.metric?.unit ?? null,
    baseline_value: input.metric?.baselineValue ?? null,
    target_value: input.metric?.targetValue ?? null,
    timebox_ends_at: input.timeboxEndsAt ?? null,
    evidence_capture_enabled: input.evidenceCaptureEnabled,
  };
}

function toUpdateRow(input: UpdateBuildBriefRequest): BuildBriefWriteRow {
  const update: BuildBriefWriteRow = {
    // `brief_version` is the existing `builds` table's revision field.
    brief_version: input.expectedRevision + 1,
  };

  if (input.title !== undefined) update.title = input.title;
  if (input.primaryContextPack !== undefined) {
    update.primary_context_pack = input.primaryContextPack;
  }
  if (input.outcome !== undefined) update.outcome = input.outcome;
  if (input.audienceOrStakeholder !== undefined) {
    update.audience_or_stakeholder = input.audienceOrStakeholder;
  }
  if (input.roleStatement !== undefined) {
    update.role_statement = input.roleStatement;
  }
  if (input.constraintsSummary !== undefined) {
    update.constraints_summary = input.constraintsSummary;
  }
  if (input.definitionOfDone !== undefined) {
    update.definition_of_done = input.definitionOfDone;
  }
  if (input.metric !== undefined) {
    update.metric_label = input.metric.label;
    update.metric_unit = input.metric.unit ?? null;
    update.baseline_value = input.metric.baselineValue ?? null;
    update.target_value = input.metric.targetValue ?? null;
  }
  if (input.timeboxEndsAt !== undefined) {
    update.timebox_ends_at = input.timeboxEndsAt;
  }
  if (input.evidenceCaptureEnabled !== undefined) {
    update.evidence_capture_enabled = input.evidenceCaptureEnabled;
  }

  return update;
}

function toBuildBriefDto(row: unknown): BuildBriefDto {
  if (!isRecord(row)) {
    throw new BuildBriefPersistenceError();
  }

  const metricLabel = row.metric_label;
  const metric = typeof metricLabel === "string"
    ? {
        label: metricLabel,
        ...optionalProperty("unit", optionalString(row.metric_unit)),
        ...optionalProperty("baselineValue", optionalNumber(row.baseline_value)),
        ...optionalProperty("targetValue", optionalNumber(row.target_value)),
      }
    : null;
  const result = buildBriefDtoSchema.safeParse({
    id: row.id,
    revision: row.brief_version,
    status: row.status,
    title: row.title,
    primaryContextPack: row.primary_context_pack,
    outcome: row.outcome,
    audienceOrStakeholder: optionalString(row.audience_or_stakeholder),
    roleStatement: optionalString(row.role_statement),
    constraintsSummary: optionalString(row.constraints_summary),
    definitionOfDone: optionalString(row.definition_of_done),
    metric,
    timeboxEndsAt: nullableString(row.timebox_ends_at),
    evidenceCaptureEnabled: row.evidence_capture_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  if (!result.success) {
    throw new BuildBriefPersistenceError();
  }

  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Record<Key, Value> | Record<never, never> {
  return value === undefined ? {} : { [key]: value } as Record<Key, Value>;
}
