import { createHash } from "node:crypto";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { ServerConfig } from "../config/env.js";
import type { BuildContextPack } from "../contracts/build-brief.contract.js";
import {
  buildCapabilityDtoSchema,
  buildConversationMessageDtoSchema,
  buildConversationSummaryDtoSchema,
  buildInsightDtoSchema,
  buildSkillOverviewItemDtoSchema,
  chatSkillInferenceDtoSchema,
  type BuildCapabilityDto,
  type BuildConversationMessageDto,
  type BuildConversationSummaryDto,
  type BuildInsightDto,
  type BuildSkillOverviewItemDto,
  type ChatSkillInferenceDto,
} from "../contracts/build-conversation.contract.js";
import type { BuildAssistantInferenceCandidate } from "../services/build-assistant.service.js";

const CONVERSATION_COLUMNS = [
  "id",
  "build_id",
  "status",
  "last_message_at",
  "created_at",
  "updated_at",
] as const;

const MESSAGE_COLUMNS = [
  "id",
  "conversation_id",
  "build_id",
  "role",
  "content",
  "in_reply_to_message_id",
  "metadata",
  "created_at",
] as const;

const INFERENCE_COLUMNS = [
  "id",
  "source_message_id",
  "capability_id",
  "context_practice_id",
  "inferred_level",
  "previous_level",
  "applied_level",
  "level_raised",
  "proof_status",
  "rationale",
  "signal_dimensions",
  "created_at",
] as const;

const CONVERSATION_SELECT = CONVERSATION_COLUMNS.join(",");
const MESSAGE_SELECT = MESSAGE_COLUMNS.join(",");
const INFERENCE_SELECT = INFERENCE_COLUMNS.join(",");

export type BuildConversationSnapshot = {
  readonly conversation: BuildConversationSummaryDto | undefined;
  readonly messages: readonly BuildConversationMessageDto[];
};

export type PersistedUserMessage = {
  readonly conversation: BuildConversationSummaryDto;
  readonly message: BuildConversationMessageDto;
  readonly wasExisting: boolean;
};

export type StartBuildAssistantRunInput = {
  readonly idempotencyKey: string;
  readonly inputFingerprint: string;
  readonly model: string;
  readonly promptVersion: string;
  /** Metadata must contain only safe counts/mode values, never raw content. */
  readonly requestMetadata: Record<string, unknown>;
};

export type CompleteBuildAssistantRunInput = {
  readonly responseFingerprint: string;
  readonly providerResponseId?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  /** Metadata must contain only safe counts/mode values, never raw output. */
  readonly responseMetadata: Record<string, unknown>;
};

export type PersistAssistantMessageInput = {
  readonly conversationId: string;
  readonly replyToMessageId: string;
  readonly content: string;
  readonly insight: BuildInsightDto | null;
  readonly mode: "model" | "fallback";
  readonly aiRunId: string;
};

/**
 * Owner-scoped persistence boundary for Build Companion data. Every private
 * table access receives the verified owner and repeats that scope even though
 * the service role bypasses Supabase RLS.
 */
export interface BuildConversationRepository {
  readonly isConfigured: boolean;
  getConversation(
    userId: string,
    buildId: string,
    limit: number,
  ): Promise<BuildConversationSnapshot>;
  persistUserMessage(
    userId: string,
    buildId: string,
    content: string,
    idempotencyKey?: string,
  ): Promise<PersistedUserMessage>;
  findAssistantReply(
    userId: string,
    buildId: string,
    conversationId: string,
    userMessageId: string,
  ): Promise<BuildConversationMessageDto | undefined>;
  persistAssistantMessage(
    userId: string,
    buildId: string,
    input: PersistAssistantMessageInput,
  ): Promise<BuildConversationMessageDto>;
  listContextCapabilities(
    contextPack: BuildContextPack,
  ): Promise<readonly BuildCapabilityDto[]>;
  listSkillOverview(
    userId: string,
    contextPack: BuildContextPack,
  ): Promise<readonly BuildSkillOverviewItemDto[]>;
  startAiRun(
    userId: string,
    buildId: string,
    input: StartBuildAssistantRunInput,
  ): Promise<string>;
  completeAiRun(
    userId: string,
    buildId: string,
    aiRunId: string,
    input: CompleteBuildAssistantRunInput,
  ): Promise<void>;
  recordInference(
    userId: string,
    buildId: string,
    conversationId: string,
    sourceMessageId: string,
    capability: BuildCapabilityDto,
    candidate: BuildAssistantInferenceCandidate,
    aiRunId: string,
  ): Promise<ChatSkillInferenceDto | undefined>;
  findInferenceBySourceMessage(
    userId: string,
    buildId: string,
    sourceMessageId: string,
  ): Promise<ChatSkillInferenceDto | undefined>;
}

/** Safe configuration signal; it never contains a connection detail or key. */
export class BuildConversationPersistenceUnavailableError extends Error {
  public constructor() {
    super("Build Companion persistence is not configured.");
    this.name = "BuildConversationPersistenceUnavailableError";
  }
}

/** Deliberately hides PostgREST and RPC internals from API clients. */
export class BuildConversationPersistenceError extends Error {
  public constructor() {
    super("Build Companion persistence failed.");
    this.name = "BuildConversationPersistenceError";
  }
}

class UnconfiguredBuildConversationRepository implements BuildConversationRepository {
  public readonly isConfigured = false;

  public async getConversation(): Promise<BuildConversationSnapshot> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async persistUserMessage(): Promise<PersistedUserMessage> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async findAssistantReply(): Promise<BuildConversationMessageDto | undefined> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async persistAssistantMessage(): Promise<BuildConversationMessageDto> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async listContextCapabilities(): Promise<readonly BuildCapabilityDto[]> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async listSkillOverview(): Promise<readonly BuildSkillOverviewItemDto[]> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async startAiRun(): Promise<string> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async completeAiRun(): Promise<void> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async recordInference(): Promise<ChatSkillInferenceDto | undefined> {
    throw new BuildConversationPersistenceUnavailableError();
  }

  public async findInferenceBySourceMessage(): Promise<ChatSkillInferenceDto | undefined> {
    throw new BuildConversationPersistenceUnavailableError();
  }
}

class SupabaseBuildConversationRepository implements BuildConversationRepository {
  public readonly isConfigured = true;

  public constructor(private readonly client: SupabaseClient) {}

  public async getConversation(
    userId: string,
    buildId: string,
    limit: number,
  ): Promise<BuildConversationSnapshot> {
    const conversation = await this.findConversation(userId, buildId);
    if (!conversation) {
      return { conversation: undefined, messages: [] };
    }

    const { data, error } = await this.client
      .from("build_messages")
      .select(MESSAGE_SELECT)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (error || !data) {
      throw new BuildConversationPersistenceError();
    }

    const messages = asRows(data)
      .reverse()
      .map(toMessageDto);
    return { conversation, messages };
  }

  public async persistUserMessage(
    userId: string,
    buildId: string,
    content: string,
    idempotencyKey?: string,
  ): Promise<PersistedUserMessage> {
    if (idempotencyKey) {
      const existing = await this.findUserMessageByIdempotencyKey(userId, idempotencyKey);
      if (existing) {
        if (
          existing.buildId !== buildId
          || existing.role !== "user"
        ) {
          // Never return another Build's message, even to the same user. The
          // client supplied a key that has already been consumed elsewhere.
          throw new BuildConversationPersistenceError();
        }

        const conversation = await this.findConversationById(
          userId,
          buildId,
          existing.conversationId,
        );
        if (!conversation) {
          throw new BuildConversationPersistenceError();
        }

        return { conversation, message: existing, wasExisting: true };
      }
    }

    const conversation = await this.ensureConversation(userId, buildId);
    const { data, error } = await this.client
      .from("build_messages")
      .insert({
        conversation_id: conversation.id,
        build_id: buildId,
        user_id: userId,
        role: "user",
        content,
        content_hash: contentFingerprint(content),
        client_idempotency_key: idempotencyKey ?? null,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (error || !data) {
      // A concurrent retry can win the partial idempotency-key index between
      // the read above and this insert. Resolve it only under the same owner.
      if (idempotencyKey) {
        const existing = await this.findUserMessageByIdempotencyKey(userId, idempotencyKey);
        if (existing && existing.buildId === buildId && existing.role === "user") {
          return { conversation, message: existing, wasExisting: true };
        }
      }
      throw new BuildConversationPersistenceError();
    }

    const message = toMessageDto(asRow(data));
    await this.touchConversation(userId, buildId, conversation.id, message.createdAt);
    return { conversation, message, wasExisting: false };
  }

  public async findAssistantReply(
    userId: string,
    buildId: string,
    conversationId: string,
    userMessageId: string,
  ): Promise<BuildConversationMessageDto | undefined> {
    const { data, error } = await this.client
      .from("build_messages")
      .select(MESSAGE_SELECT)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .eq("conversation_id", conversationId)
      .eq("role", "assistant")
      .eq("in_reply_to_message_id", userMessageId)
      .maybeSingle();

    if (error) {
      throw new BuildConversationPersistenceError();
    }

    return data ? toMessageDto(asRow(data)) : undefined;
  }

  public async persistAssistantMessage(
    userId: string,
    buildId: string,
    input: PersistAssistantMessageInput,
  ): Promise<BuildConversationMessageDto> {
    const { data, error } = await this.client
      .from("build_messages")
      .insert({
        conversation_id: input.conversationId,
        build_id: buildId,
        user_id: userId,
        role: "assistant",
        content: input.content,
        content_hash: contentFingerprint(input.content),
        in_reply_to_message_id: input.replyToMessageId,
        ai_run_id: input.aiRunId,
        metadata: {
          mode: input.mode,
          insight: input.insight,
        },
      })
      .select(MESSAGE_SELECT)
      .single();

    if (error || !data) {
      // A retry can race to persist the same single assistant reply. Returning
      // the owner-scoped existing record preserves exactly one reply source.
      const existing = await this.findAssistantReply(
        userId,
        buildId,
        input.conversationId,
        input.replyToMessageId,
      );
      if (existing) {
        return existing;
      }
      throw new BuildConversationPersistenceError();
    }

    const message = toMessageDto(asRow(data));
    await this.touchConversation(userId, buildId, input.conversationId, message.createdAt);
    return message;
  }

  public async listContextCapabilities(
    contextPack: BuildContextPack,
  ): Promise<readonly BuildCapabilityDto[]> {
    const { data: practicesData, error: practicesError } = await this.client
      .from("context_practices")
      .select("id,capability_id")
      .eq("context_pack", contextPack)
      .eq("is_active", true)
      .order("slug", { ascending: true });

    if (practicesError || !practicesData) {
      throw new BuildConversationPersistenceError();
    }

    const practices = asRows(practicesData);
    if (practices.length === 0) {
      return [];
    }

    const capabilityIds = practices.map((practice) => requiredString(practice.capability_id));
    const { data: capabilitiesData, error: capabilitiesError } = await this.client
      .from("capabilities")
      .select("id,slug,name")
      .eq("is_active", true)
      .in("id", capabilityIds);

    if (capabilitiesError || !capabilitiesData) {
      throw new BuildConversationPersistenceError();
    }

    const capabilityById = new Map(
      asRows(capabilitiesData).map((capability) => [
        requiredString(capability.id),
        capability,
      ]),
    );

    const options: BuildCapabilityDto[] = [];
    for (const practice of practices) {
      const capability = capabilityById.get(requiredString(practice.capability_id));
      if (!capability) {
        continue;
      }

      const parsed = buildCapabilityDtoSchema.safeParse({
        id: capability.id,
        slug: capability.slug,
        name: capability.name,
        contextPracticeId: practice.id,
      });
      if (!parsed.success) {
        throw new BuildConversationPersistenceError();
      }
      options.push(parsed.data);
    }

    return options;
  }

  public async listSkillOverview(
    userId: string,
    contextPack: BuildContextPack,
  ): Promise<readonly BuildSkillOverviewItemDto[]> {
    const capabilities = await this.listContextCapabilities(contextPack);
    if (capabilities.length === 0) {
      return [];
    }

    const capabilityIds = [...new Set(capabilities.map((capability) => capability.id))];
    const { data, error } = await this.client
      .from("skill_profiles")
      .select("capability_id,level,proof_status,assessment_basis")
      // Service-role access bypasses RLS, so this owner predicate is mandatory.
      .eq("user_id", userId)
      .in("capability_id", capabilityIds);

    if (error || !data) {
      throw new BuildConversationPersistenceError();
    }

    const profileByCapabilityId = new Map(
      asRows(data).map((profile) => [requiredString(profile.capability_id), profile]),
    );
    const overviewByCapabilityId = new Map<string, BuildSkillOverviewItemDto>();

    for (const capability of capabilities) {
      if (overviewByCapabilityId.has(capability.id)) {
        continue;
      }

      const profile = profileByCapabilityId.get(capability.id);
      // A profile is materialised when chat first grounds a signal. Before
      // that, return the Build Brief's server-owned Beginner baseline rather
      // than recreating the old client-side estimate heuristic.
      const parsed = buildSkillOverviewItemDtoSchema.safeParse({
        capabilityId: capability.id,
        capabilitySlug: capability.slug,
        capabilityName: capability.name,
        level: profile?.level ?? "beginner",
        proofStatus: profile?.proof_status ?? "unverified_estimate",
        assessmentBasis: profile?.assessment_basis ?? "brief_derived",
      });
      if (!parsed.success) {
        throw new BuildConversationPersistenceError();
      }
      overviewByCapabilityId.set(capability.id, parsed.data);
    }

    return [...overviewByCapabilityId.values()];
  }

  public async startAiRun(
    userId: string,
    buildId: string,
    input: StartBuildAssistantRunInput,
  ): Promise<string> {
    const { data, error } = await this.client
      .from("ai_runs")
      .upsert(
        {
          build_id: buildId,
          user_id: userId,
          purpose: "chat_response",
          status: "processing",
          idempotency_key: input.idempotencyKey,
          input_fingerprint: input.inputFingerprint,
          response_fingerprint: null,
          provider_response_id: null,
          model: input.model,
          prompt_version: input.promptVersion,
          schema_version: "build-companion-response-v1",
          request_metadata: input.requestMetadata,
          response_metadata: {},
          input_tokens: null,
          output_tokens: null,
          estimated_cost_usd: null,
          error_code: null,
          started_at: new Date().toISOString(),
          completed_at: null,
        },
        { onConflict: "user_id,idempotency_key" },
      )
      .select("id")
      .single();

    if (error || !data || !isUuid((data as Record<string, unknown>).id)) {
      throw new BuildConversationPersistenceError();
    }

    return (data as Record<string, unknown>).id as string;
  }

  public async completeAiRun(
    userId: string,
    buildId: string,
    aiRunId: string,
    input: CompleteBuildAssistantRunInput,
  ): Promise<void> {
    const { data, error } = await this.client
      .from("ai_runs")
      .update({
        status: "succeeded",
        response_fingerprint: input.responseFingerprint,
        provider_response_id: input.providerResponseId ?? null,
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        response_metadata: input.responseMetadata,
        completed_at: new Date().toISOString(),
      })
      .eq("id", aiRunId)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      throw new BuildConversationPersistenceError();
    }
  }

  public async recordInference(
    userId: string,
    buildId: string,
    conversationId: string,
    sourceMessageId: string,
    capability: BuildCapabilityDto,
    candidate: BuildAssistantInferenceCandidate,
    aiRunId: string,
  ): Promise<ChatSkillInferenceDto | undefined> {
    const { data, error } = await this.client.rpc("record_chat_skill_inference", {
      p_user_id: userId,
      p_build_id: buildId,
      p_conversation_id: conversationId,
      p_source_message_id: sourceMessageId,
      p_capability_id: capability.id,
      p_context_practice_id: capability.contextPracticeId,
      p_inferred_level: candidate.inferredLevel,
      p_rationale: candidate.rationale,
      p_signal_dimensions: candidate.dimensions,
      p_ai_run_id: aiRunId,
    });

    if (error || !rpcId(data)) {
      throw new BuildConversationPersistenceError();
    }

    return this.findInferenceBySourceMessage(userId, buildId, sourceMessageId);
  }

  public async findInferenceBySourceMessage(
    userId: string,
    buildId: string,
    sourceMessageId: string,
  ): Promise<ChatSkillInferenceDto | undefined> {
    const { data, error } = await this.client
      .from("chat_skill_inferences")
      .select(INFERENCE_SELECT)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .eq("source_message_id", sourceMessageId)
      .maybeSingle();

    if (error) {
      throw new BuildConversationPersistenceError();
    }
    if (!data) {
      return undefined;
    }

    const inference = asRow(data);
    const capabilityId = requiredString(inference.capability_id);
    const { data: capabilityData, error: capabilityError } = await this.client
      .from("capabilities")
      .select("id,slug,name")
      .eq("id", capabilityId)
      .eq("is_active", true)
      .maybeSingle();

    if (capabilityError || !capabilityData) {
      throw new BuildConversationPersistenceError();
    }

    return toInferenceDto(inference, asRow(capabilityData));
  }

  private async findConversation(
    userId: string,
    buildId: string,
  ): Promise<BuildConversationSummaryDto | undefined> {
    const { data, error } = await this.client
      .from("build_conversations")
      .select(CONVERSATION_SELECT)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .maybeSingle();

    if (error) {
      throw new BuildConversationPersistenceError();
    }

    return data ? toConversationSummaryDto(asRow(data)) : undefined;
  }

  private async findConversationById(
    userId: string,
    buildId: string,
    conversationId: string,
  ): Promise<BuildConversationSummaryDto | undefined> {
    const { data, error } = await this.client
      .from("build_conversations")
      .select(CONVERSATION_SELECT)
      .eq("id", conversationId)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .maybeSingle();

    if (error) {
      throw new BuildConversationPersistenceError();
    }

    return data ? toConversationSummaryDto(asRow(data)) : undefined;
  }

  private async ensureConversation(
    userId: string,
    buildId: string,
  ): Promise<BuildConversationSummaryDto> {
    const existing = await this.findConversation(userId, buildId);
    if (existing) {
      return existing;
    }

    const { data, error } = await this.client
      .from("build_conversations")
      .insert({ build_id: buildId, user_id: userId })
      .select(CONVERSATION_SELECT)
      .single();

    if (error || !data) {
      // The unique Build/owner boundary makes a concurrent first message safe.
      const concurrent = await this.findConversation(userId, buildId);
      if (concurrent) {
        return concurrent;
      }
      throw new BuildConversationPersistenceError();
    }

    return toConversationSummaryDto(asRow(data));
  }

  private async findUserMessageByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<BuildConversationMessageDto | undefined> {
    const { data, error } = await this.client
      .from("build_messages")
      .select(MESSAGE_SELECT)
      .eq("user_id", userId)
      .eq("client_idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) {
      throw new BuildConversationPersistenceError();
    }

    return data ? toMessageDto(asRow(data)) : undefined;
  }

  private async touchConversation(
    userId: string,
    buildId: string,
    conversationId: string,
    lastMessageAt: string,
  ): Promise<void> {
    const { data, error } = await this.client
      .from("build_conversations")
      .update({ last_message_at: lastMessageAt })
      .eq("id", conversationId)
      .eq("user_id", userId)
      .eq("build_id", buildId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      throw new BuildConversationPersistenceError();
    }
  }
}

/**
 * Creates the BFF-only Build Companion repository. There is no in-memory
 * persistence substitute: a user message must be durably private or fail.
 */
export function createBuildConversationRepository(
  config: ServerConfig,
): BuildConversationRepository {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    return new UnconfiguredBuildConversationRepository();
  }

  const client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return new SupabaseBuildConversationRepository(client);
}

export function contentFingerprint(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function toConversationSummaryDto(row: Record<string, unknown>): BuildConversationSummaryDto {
  const parsed = buildConversationSummaryDtoSchema.safeParse({
    id: row.id,
    buildId: row.build_id,
    status: row.status,
    lastMessageAt: nullableString(row.last_message_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  if (!parsed.success) {
    throw new BuildConversationPersistenceError();
  }
  return parsed.data;
}

function toMessageDto(row: Record<string, unknown>): BuildConversationMessageDto {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const insight = buildInsightDtoSchema.safeParse(metadata.insight);
  const mode = metadata.mode === "model" || metadata.mode === "fallback"
    ? metadata.mode
    : null;
  const parsed = buildConversationMessageDtoSchema.safeParse({
    id: row.id,
    conversationId: row.conversation_id,
    buildId: row.build_id,
    role: row.role,
    content: row.content,
    inReplyToMessageId: nullableString(row.in_reply_to_message_id),
    mode,
    insight: insight.success ? insight.data : null,
    createdAt: row.created_at,
  });

  if (!parsed.success) {
    throw new BuildConversationPersistenceError();
  }
  return parsed.data;
}

function toInferenceDto(
  inference: Record<string, unknown>,
  capability: Record<string, unknown>,
): ChatSkillInferenceDto {
  const parsed = chatSkillInferenceDtoSchema.safeParse({
    id: inference.id,
    sourceMessageId: inference.source_message_id,
    capability: {
      id: capability.id,
      slug: capability.slug,
      name: capability.name,
      contextPracticeId: inference.context_practice_id,
    },
    inferredLevel: inference.inferred_level,
    previousEstimatedLevel: inference.previous_level,
    estimatedLevel: inference.applied_level,
    levelRaised: inference.level_raised,
    proofStatus: inference.proof_status,
    visibility: "private",
    rationale: inference.rationale,
    dimensions: inference.signal_dimensions,
    createdAt: inference.created_at,
  });

  if (!parsed.success) {
    throw new BuildConversationPersistenceError();
  }
  return parsed.data;
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new BuildConversationPersistenceError();
  }
  return value.map(asRow);
}

function asRow(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BuildConversationPersistenceError();
  }
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BuildConversationPersistenceError();
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rpcId(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const id = isRecord(candidate) ? candidate.id : candidate;
  return isUuid(id) ? id : undefined;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
