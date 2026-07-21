import { z } from "zod";

/**
 * Private Build Companion API contracts. These records intentionally never
 * carry a verified/public skill claim: any automatic inference is explicitly
 * an unverified, private estimate tied to one exact user message.
 */

export const buildConversationStatusValues = ["active", "archived"] as const;
export const buildMessageRoleValues = ["user", "assistant"] as const;
export const assistantExecutionModeValues = ["model", "fallback"] as const;
export const inferredSkillLevelValues = [
  "novice",
  "beginner",
  "intermediate",
  "advanced",
] as const;
export const skillProofStatusValues = [
  "unverified_estimate",
  "proof_linked",
  "source_validated",
  "independently_verified",
] as const;
export const skillEstimateBasisValues = [
  "brief_derived",
  "evidence_derived",
  "chat_inferred",
] as const;
export const skillLevelValues = [
  "not_yet_assessed",
  ...inferredSkillLevelValues,
] as const;
export const inferenceDimensionValues = [
  "exploration",
  "guided_execution",
  "independent_execution",
  "reasoning",
  "tradeoff",
  "measurement",
  "iteration",
  "outcome",
  "leadership",
] as const;

export const buildConversationStatusSchema = z.enum(buildConversationStatusValues);
export const buildMessageRoleSchema = z.enum(buildMessageRoleValues);
export const assistantExecutionModeSchema = z.enum(assistantExecutionModeValues);
export const inferredSkillLevelSchema = z.enum(inferredSkillLevelValues);
export const skillLevelSchema = z.enum(skillLevelValues);
export const skillProofStatusSchema = z.enum(skillProofStatusValues);
export const skillEstimateBasisSchema = z.enum(skillEstimateBasisValues);
export const inferenceDimensionSchema = z.enum(inferenceDimensionValues);

const identifierSchema = z.string().uuid();
const isoTimestampSchema = z.string().datetime({ offset: true });

function text(
  label: string,
  min: number,
  max: number,
): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string({ invalid_type_error: `${label} must be text.` })
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be ${max} characters or fewer.`)
    .refine((value) => !value.includes("\u0000"), {
      message: `${label} cannot contain null characters.`,
    });
}

export const buildMessageContentSchema = text("Message", 1, 16_000);
const insightQuestionSchema = text("Insight question", 1, 800);
const insightRationaleSchema = text("Insight rationale", 1, 800);
const inferenceRationaleSchema = text("Inference rationale", 1, 1_000);

export const buildConversationParamsSchema = z
  .object({ buildId: identifierSchema })
  .strict();

export const buildConversationQuerySchema = z
  .object({
    limit: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : value,
        z.number().int().min(1).max(50).optional(),
      ),
  })
  .strict();

export const createBuildConversationMessageRequestSchema = z
  .object({
    content: buildMessageContentSchema,
    idempotencyKey: identifierSchema.optional(),
  })
  .strict();

export const buildInsightDtoSchema = z
  .object({
    question: insightQuestionSchema,
    rationale: insightRationaleSchema,
    /** Compatibility/display alias; it contains the same private rationale. */
    whyNow: insightRationaleSchema.optional(),
    capabilitySlug: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const inferredSkillDisplayDtoSchema = z
  .object({
    capabilityName: text("Capability name", 1, 160),
    level: skillLevelSchema,
    status: z.literal("unverified"),
    rationale: inferenceRationaleSchema.optional(),
  })
  .strict();

/** A small display adapter for the companion UI; private provenance stays in the inference record. */
export const questionAnalysisDtoSchema = z
  .object({
    inferredSkills: z.array(inferredSkillDisplayDtoSchema).min(1).max(1),
  })
  .strict();

export const buildConversationMessageDtoSchema = z
  .object({
    id: identifierSchema,
    conversationId: identifierSchema,
    buildId: identifierSchema,
    role: buildMessageRoleSchema,
    content: buildMessageContentSchema,
    inReplyToMessageId: identifierSchema.nullable(),
    mode: assistantExecutionModeSchema.nullable(),
    insight: buildInsightDtoSchema.nullable(),
    analysis: questionAnalysisDtoSchema.optional(),
    createdAt: isoTimestampSchema,
  })
  .strict();

export const buildCapabilityDtoSchema = z
  .object({
    id: identifierSchema,
    slug: z.string().trim().min(1).max(160),
    name: text("Capability name", 1, 160),
    contextPracticeId: identifierSchema,
  })
  .strict();

/**
 * The private, Build-relevant read model for the user's current capability
 * estimates. It intentionally excludes message content and proof URLs; those
 * remain behind their dedicated private workflows.
 */
export const buildSkillOverviewItemDtoSchema = z
  .object({
    capabilityId: identifierSchema,
    capabilitySlug: z.string().trim().min(1).max(160),
    capabilityName: text("Capability name", 1, 160),
    level: skillLevelSchema,
    proofStatus: skillProofStatusSchema,
    assessmentBasis: skillEstimateBasisSchema,
  })
  .strict();

export const buildSkillOverviewResponseSchema = z
  .object({
    data: z
      .object({
        skillProfiles: z.array(buildSkillOverviewItemDtoSchema).max(50),
      })
      .strict(),
  })
  .strict();

export const chatSkillInferenceDtoSchema = z
  .object({
    id: identifierSchema,
    sourceMessageId: identifierSchema,
    capability: buildCapabilityDtoSchema,
    inferredLevel: inferredSkillLevelSchema,
    previousEstimatedLevel: skillLevelSchema,
    estimatedLevel: skillLevelSchema,
    levelRaised: z.boolean(),
    proofStatus: z.literal("unverified_estimate"),
    visibility: z.literal("private"),
    rationale: inferenceRationaleSchema,
    dimensions: z.array(inferenceDimensionSchema).max(9),
    createdAt: isoTimestampSchema,
  })
  .strict();

export const buildConversationSummaryDtoSchema = z
  .object({
    id: identifierSchema,
    buildId: identifierSchema,
    status: buildConversationStatusSchema,
    lastMessageAt: isoTimestampSchema.nullable(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const buildConversationDtoSchema = z
  .object({
    /** Omitted for a private, not-yet-created empty conversation. */
    id: identifierSchema.optional(),
    buildId: identifierSchema,
    status: buildConversationStatusSchema,
    lastMessageAt: isoTimestampSchema.nullable(),
    messages: z.array(buildConversationMessageDtoSchema).max(50),
    latestInsight: buildInsightDtoSchema.nullable(),
    createdAt: isoTimestampSchema.optional(),
    updatedAt: isoTimestampSchema.optional(),
  })
  .strict();

export const buildConversationResponseSchema = z
  .object({
    data: z.object({ conversation: buildConversationDtoSchema }).strict(),
  })
  .strict();

export const createBuildConversationMessageResponseSchema = z
  .object({
    data: z
      .object({
        userMessage: buildConversationMessageDtoSchema,
        assistantMessage: buildConversationMessageDtoSchema,
        insight: buildInsightDtoSchema.nullable(),
        /** UI-friendly private estimate adapter. */
        inference: questionAnalysisDtoSchema.nullable(),
        /** Full exact-message provenance, private and never verified. */
        inferenceRecord: chatSkillInferenceDtoSchema.nullable(),
      })
      .strict(),
  })
  .strict();

export type BuildConversationQuery = z.infer<typeof buildConversationQuerySchema>;
export type CreateBuildConversationMessageRequest = z.infer<
  typeof createBuildConversationMessageRequestSchema
>;
export type BuildInsightDto = z.infer<typeof buildInsightDtoSchema>;
export type QuestionAnalysisDto = z.infer<typeof questionAnalysisDtoSchema>;
export type BuildConversationMessageDto = z.infer<
  typeof buildConversationMessageDtoSchema
>;
export type BuildCapabilityDto = z.infer<typeof buildCapabilityDtoSchema>;
export type BuildSkillOverviewItemDto = z.infer<
  typeof buildSkillOverviewItemDtoSchema
>;
export type ChatSkillInferenceDto = z.infer<typeof chatSkillInferenceDtoSchema>;
export type BuildConversationSummaryDto = z.infer<
  typeof buildConversationSummaryDtoSchema
>;
export type BuildConversationDto = z.infer<typeof buildConversationDtoSchema>;
