import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { ServerConfig } from "../config/env.js";
import {
  evidenceCardDtoSchema,
  evidenceSourceDtoSchema,
  type CreateManualEvidenceCardRequest,
  type EvidenceCardDto,
  type EvidenceCardListQuery,
  type EvidenceSourceDto,
  type EvidenceTransitionAction,
} from "../contracts/evidence-card.contract.js";

const EVIDENCE_CARD_COLUMNS = [
  "id",
  "build_id",
  "origin",
  "status",
  "claim_summary",
  "contribution",
  "role_statement",
  "reviewed_at",
  "confirmed_at",
  "revoked_at",
  "revocation_reason",
  "created_at",
  "updated_at",
] as const;

const EVIDENCE_SOURCE_COLUMNS = [
  "id",
  "evidence_card_id",
  "source_type",
  "source_label",
  "source_excerpt",
  "created_at",
] as const;

const EVIDENCE_CARD_SELECT = EVIDENCE_CARD_COLUMNS.join(",");
const EVIDENCE_SOURCE_SELECT = EVIDENCE_SOURCE_COLUMNS.join(",");
const DEFAULT_LIST_LIMIT = 50;

export type EvidenceCardTransitionResult =
  | { readonly kind: "updated"; readonly evidenceCard: EvidenceCardDto }
  | { readonly kind: "not_found" }
  | { readonly kind: "invalid_transition" };

/**
 * Private evidence persistence boundary. It mirrors the Build Brief boundary:
 * the route supplies an authenticated owner and the repository scopes every
 * service-role operation by that owner and the containing build.
 */
export interface EvidenceCardRepository {
  readonly isConfigured: boolean;
  list(
    userId: string,
    buildId: string,
    query: EvidenceCardListQuery,
  ): Promise<readonly EvidenceCardDto[]>;
  findById(
    userId: string,
    buildId: string,
    evidenceCardId: string,
  ): Promise<EvidenceCardDto | undefined>;
  create(
    userId: string,
    buildId: string,
    input: CreateManualEvidenceCardRequest,
  ): Promise<EvidenceCardDto>;
  transition(
    userId: string,
    buildId: string,
    evidenceCardId: string,
    action: EvidenceTransitionAction | "revoke",
    revocationReason?: string,
  ): Promise<EvidenceCardTransitionResult>;
}

/** Safe configuration-gated signal that never includes server credentials. */
export class EvidenceCardPersistenceUnavailableError extends Error {
  public constructor() {
    super("Evidence-card persistence is not configured.");
    this.name = "EvidenceCardPersistenceUnavailableError";
  }
}

/** Deliberately hides PostgREST/RPC internals from API clients. */
export class EvidenceCardPersistenceError extends Error {
  public constructor() {
    super("Evidence-card persistence failed.");
    this.name = "EvidenceCardPersistenceError";
  }
}

class UnconfiguredEvidenceCardRepository implements EvidenceCardRepository {
  public readonly isConfigured = false;

  public async list(): Promise<readonly EvidenceCardDto[]> {
    throw new EvidenceCardPersistenceUnavailableError();
  }

  public async findById(): Promise<EvidenceCardDto | undefined> {
    throw new EvidenceCardPersistenceUnavailableError();
  }

  public async create(): Promise<EvidenceCardDto> {
    throw new EvidenceCardPersistenceUnavailableError();
  }

  public async transition(): Promise<EvidenceCardTransitionResult> {
    throw new EvidenceCardPersistenceUnavailableError();
  }
}

class SupabaseEvidenceCardRepository implements EvidenceCardRepository {
  public readonly isConfigured = true;

  public constructor(private readonly client: SupabaseClient) {}

  public async list(
    userId: string,
    buildId: string,
    query: EvidenceCardListQuery,
  ): Promise<readonly EvidenceCardDto[]> {
    const baseQuery = this.client
      .from("evidence_cards")
      .select(EVIDENCE_CARD_SELECT)
      // Service-role access bypasses RLS. Scope every query explicitly.
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .order("created_at", { ascending: false });
    const filteredQuery = query.status
      ? baseQuery.eq("status", query.status)
      : baseQuery;
    const { data, error } = await filteredQuery.limit(
      query.limit ?? DEFAULT_LIST_LIMIT,
    );

    if (error || !data) {
      throw new EvidenceCardPersistenceError();
    }

    const cardRows = asRows(data);
    const sourcesByCardId = await this.findSourcesByCardIds(
      userId,
      buildId,
      cardRows.map((row) => requiredString(row.id)),
    );

    return cardRows.map((row) =>
      toEvidenceCardDto(row, sourcesByCardId.get(requiredString(row.id)) ?? []),
    );
  }

  public async findById(
    userId: string,
    buildId: string,
    evidenceCardId: string,
  ): Promise<EvidenceCardDto | undefined> {
    const { data, error } = await this.client
      .from("evidence_cards")
      .select(EVIDENCE_CARD_SELECT)
      .eq("id", evidenceCardId)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .maybeSingle();

    if (error) {
      throw new EvidenceCardPersistenceError();
    }

    if (!data) {
      return undefined;
    }

    const row = asRow(data);
    const cardId = requiredString(row.id);
    const sourcesByCardId = await this.findSourcesByCardIds(userId, buildId, [cardId]);
    return toEvidenceCardDto(row, sourcesByCardId.get(cardId) ?? []);
  }

  public async create(
    userId: string,
    buildId: string,
    input: CreateManualEvidenceCardRequest,
  ): Promise<EvidenceCardDto> {
    // The reviewed migration implements this as one transaction: it validates
    // build ownership, creates the suggested card plus its private source, and
    // appends the matching evidence event. Supabase JS does not expose a
    // client-side transaction that can safely replace this RPC.
    const { data, error } = await this.client.rpc("create_manual_evidence_card", {
      p_user_id: userId,
      p_build_id: buildId,
      p_claim_summary: input.claimSummary,
      p_contribution: input.contribution,
      p_role_statement: input.roleStatement ?? null,
      p_source_label: input.source.label,
      p_source_excerpt: input.source.excerpt,
      p_idempotency_key: input.idempotencyKey ?? null,
    });

    if (error) {
      throw new EvidenceCardPersistenceError();
    }

    const evidenceCardId = rpcEvidenceCardId(data);
    if (!evidenceCardId) {
      throw new EvidenceCardPersistenceError();
    }

    const evidenceCard = await this.findById(userId, buildId, evidenceCardId);
    if (!evidenceCard) {
      throw new EvidenceCardPersistenceError();
    }

    return evidenceCard;
  }

  public async transition(
    userId: string,
    buildId: string,
    evidenceCardId: string,
    action: EvidenceTransitionAction | "revoke",
    revocationReason?: string,
  ): Promise<EvidenceCardTransitionResult> {
    // Check the legal lifecycle before invoking the transactional RPC. This
    // lets the HTTP layer distinguish a stale/invalid action from a missing
    // record without exposing database details. The RPC repeats this guard so
    // a concurrent request cannot bypass it.
    const current = await this.findById(userId, buildId, evidenceCardId);
    if (!current) {
      return { kind: "not_found" };
    }

    if (!canTransition(current.status, action)) {
      return { kind: "invalid_transition" };
    }

    if (isAlreadyAtTransitionTarget(current.status, action)) {
      return { kind: "updated", evidenceCard: current };
    }

    // The RPC owns legal lifecycle transitions, timestamp updates, and the
    // append-only event record. A caller cannot select a database status.
    const { data, error } = await this.client.rpc("transition_manual_evidence_card", {
      p_user_id: userId,
      p_build_id: buildId,
      p_evidence_card_id: evidenceCardId,
      p_action: action,
      p_revocation_reason: revocationReason ?? null,
    });

    if (error) {
      throw new EvidenceCardPersistenceError();
    }

    const returnedCardId = rpcEvidenceCardId(data);
    if (!returnedCardId) {
      // A state change between the owner-scoped read above and the RPC means
      // the requested action is no longer legal. Do not pretend it succeeded.
      return { kind: "invalid_transition" };
    }

    if (returnedCardId !== evidenceCardId) {
      // Never accept a routine response that points outside the caller's
      // requested record, even though the follow-up lookup is owner-scoped.
      throw new EvidenceCardPersistenceError();
    }

    const evidenceCard = await this.findById(userId, buildId, evidenceCardId);
    return evidenceCard
      ? { kind: "updated", evidenceCard }
      : { kind: "not_found" };
  }

  private async findSourcesByCardIds(
    userId: string,
    buildId: string,
    evidenceCardIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly EvidenceSourceDto[]>> {
    if (evidenceCardIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.client
      .from("evidence_sources")
      .select(EVIDENCE_SOURCE_SELECT)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .in("evidence_card_id", evidenceCardIds)
      .order("created_at", { ascending: true });

    if (error || !data) {
      throw new EvidenceCardPersistenceError();
    }

    const byCardId = new Map<string, EvidenceSourceDto[]>();
    for (const row of asRows(data)) {
      const evidenceCardId = requiredString(row.evidence_card_id);
      const current = byCardId.get(evidenceCardId);
      const source = toEvidenceSourceDto(row);
      if (current) {
        current.push(source);
      } else {
        byCardId.set(evidenceCardId, [source]);
      }
    }

    return byCardId;
  }
}

function canTransition(
  status: EvidenceCardDto["status"],
  action: EvidenceTransitionAction | "revoke",
): boolean {
  if (action === "confirm") {
    return status === "suggested" || status === "confirmed";
  }

  if (action === "dismiss") {
    return status === "suggested" || status === "dismissed";
  }

  return (
    status === "confirmed"
    || status === "linked"
    || status === "outcome_supported"
    || status === "revoked"
  );
}

function isAlreadyAtTransitionTarget(
  status: EvidenceCardDto["status"],
  action: EvidenceTransitionAction | "revoke",
): boolean {
  return (
    (action === "confirm" && status === "confirmed")
    || (action === "dismiss" && status === "dismissed")
    || (action === "revoke" && status === "revoked")
  );
}

/**
 * Creates the BFF-only evidence repository. There is intentionally no memory
 * fallback: a private evidence record must either be durably stored or fail.
 */
export function createEvidenceCardRepository(
  config: ServerConfig,
): EvidenceCardRepository {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    return new UnconfiguredEvidenceCardRepository();
  }

  const client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return new SupabaseEvidenceCardRepository(client);
}

function toEvidenceCardDto(
  row: Record<string, unknown>,
  sources: readonly EvidenceSourceDto[],
): EvidenceCardDto {
  const result = evidenceCardDtoSchema.safeParse({
    id: row.id,
    buildId: row.build_id,
    origin: row.origin,
    status: row.status,
    claimSummary: row.claim_summary,
    contribution: row.contribution,
    roleStatement: optionalString(row.role_statement),
    sources,
    reviewedAt: nullableString(row.reviewed_at),
    confirmedAt: nullableString(row.confirmed_at),
    revokedAt: nullableString(row.revoked_at),
    revocationReason: optionalString(row.revocation_reason),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  if (!result.success) {
    throw new EvidenceCardPersistenceError();
  }

  return result.data;
}

function toEvidenceSourceDto(row: Record<string, unknown>): EvidenceSourceDto {
  const result = evidenceSourceDtoSchema.safeParse({
    id: row.id,
    type: row.source_type,
    label: row.source_label,
    excerpt: optionalString(row.source_excerpt),
    createdAt: row.created_at,
  });

  if (!result.success) {
    throw new EvidenceCardPersistenceError();
  }

  return result.data;
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new EvidenceCardPersistenceError();
  }

  return value.map(asRow);
}

function asRow(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EvidenceCardPersistenceError();
  }

  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EvidenceCardPersistenceError();
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Supports an RPC returning an id scalar, a row, or a one-row result set. */
function rpcEvidenceCardId(value: unknown): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  const candidate = typeof result === "string"
    ? result
    : isRecord(result)
      ? result.id
      : undefined;

  return isUuid(candidate) ? candidate : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
