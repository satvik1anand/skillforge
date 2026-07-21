import { z } from "zod";

/**
 * Private evidence-card contracts. These deliberately describe reviewable
 * evidence, not a skill level, proof status, or shareable portfolio claim.
 * Owner IDs, lifecycle origin, and publication fields are always server-owned.
 */

export const evidenceCardStatusValues = [
  "suggested",
  "confirmed",
  "linked",
  "outcome_supported",
  "dismissed",
  "revoked",
] as const;

export const evidenceCardOriginValues = ["ai", "user", "import"] as const;

export const evidenceContributionValues = ["individual", "team"] as const;

export const evidenceSourceTypeValues = [
  "user_explanation",
  "chat_message",
  "decision",
  "artifact",
  "task_output",
  "repository",
  "deployment",
  "metric_snapshot",
  "self_attestation",
  "external_credential",
  "public_outcome",
] as const;

export const evidenceTransitionActionValues = ["confirm", "dismiss"] as const;

export const evidenceCardStatusSchema = z.enum(evidenceCardStatusValues);
export const evidenceCardOriginSchema = z.enum(evidenceCardOriginValues);
export const evidenceContributionSchema = z.enum(evidenceContributionValues);
export const evidenceSourceTypeSchema = z.enum(evidenceSourceTypeValues);
export const evidenceTransitionActionSchema = z.enum(evidenceTransitionActionValues);

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

const optionalText = (label: string, max: number) =>
  z
    .string({ invalid_type_error: `${label} must be text.` })
    .trim()
    .min(1, `${label} cannot be blank when provided.`)
    .max(max, `${label} must be ${max} characters or fewer.`)
    .refine((value) => !value.includes("\u0000"), {
      message: `${label} cannot contain null characters.`,
    })
    .optional();

export const evidenceClaimSummarySchema = text("Evidence summary", 1, 4_000);
export const evidenceRoleStatementSchema = optionalText("Role statement", 2_000);
export const evidenceSourceLabelSchema = text("Source label", 1, 240);
export const evidenceSourceExcerptSchema = text("Source excerpt", 1, 8_000);
export const evidenceRevocationReasonSchema = optionalText(
  "Revocation reason",
  2_000,
);

const manualEvidenceSourceInputSchema = z
  .object({
    label: evidenceSourceLabelSchema,
    excerpt: evidenceSourceExcerptSchema,
  })
  .strict();

/**
 * A user-created card intentionally starts as `suggested`. A separate,
 * deliberate confirm action is required before it can ever support a future
 * assessment. The source kind is fixed by the server to a private user note.
 */
export const createManualEvidenceCardRequestSchema = z
  .object({
    claimSummary: evidenceClaimSummarySchema,
    contribution: evidenceContributionSchema,
    roleStatement: evidenceRoleStatementSchema,
    source: manualEvidenceSourceInputSchema,
    idempotencyKey: identifierSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.contribution === "team" && value.roleStatement === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roleStatement"],
        message: "Team evidence requires a role statement.",
      });
    }
  });

export const transitionEvidenceCardRequestSchema = z
  .object({ action: evidenceTransitionActionSchema })
  .strict();

export const revokeEvidenceCardRequestSchema = z
  .object({ reason: evidenceRevocationReasonSchema })
  .strict();

export const evidenceBuildParamsSchema = z
  .object({ buildId: identifierSchema })
  .strict();

export const evidenceCardParamsSchema = z
  .object({ buildId: identifierSchema, cardId: identifierSchema })
  .strict();

export const evidenceCardListQuerySchema = z
  .object({
    limit: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : value,
        z.number().int().min(1).max(50).optional(),
      ),
    status: evidenceCardStatusSchema.optional(),
  })
  .strict();

export const evidenceSourceDtoSchema = z
  .object({
    id: identifierSchema,
    type: evidenceSourceTypeSchema,
    label: evidenceSourceLabelSchema,
    excerpt: evidenceSourceExcerptSchema.optional(),
    createdAt: isoTimestampSchema,
  })
  .strict();

export const evidenceCardDtoSchema = z
  .object({
    id: identifierSchema,
    buildId: identifierSchema,
    origin: evidenceCardOriginSchema,
    status: evidenceCardStatusSchema,
    claimSummary: evidenceClaimSummarySchema,
    contribution: evidenceContributionSchema,
    roleStatement: evidenceRoleStatementSchema,
    sources: z.array(evidenceSourceDtoSchema).max(50),
    reviewedAt: isoTimestampSchema.nullable(),
    confirmedAt: isoTimestampSchema.nullable(),
    revokedAt: isoTimestampSchema.nullable(),
    revocationReason: evidenceRevocationReasonSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const evidenceCardResponseSchema = z
  .object({ data: z.object({ evidenceCard: evidenceCardDtoSchema }).strict() })
  .strict();

export const evidenceCardListResponseSchema = z
  .object({
    data: z
      .object({ items: z.array(evidenceCardDtoSchema).max(50) })
      .strict(),
  })
  .strict();

export type CreateManualEvidenceCardRequest = z.infer<
  typeof createManualEvidenceCardRequestSchema
>;
export type TransitionEvidenceCardRequest = z.infer<
  typeof transitionEvidenceCardRequestSchema
>;
export type RevokeEvidenceCardRequest = z.infer<
  typeof revokeEvidenceCardRequestSchema
>;
export type EvidenceCardListQuery = z.infer<typeof evidenceCardListQuerySchema>;
export type EvidenceCardDto = z.infer<typeof evidenceCardDtoSchema>;
export type EvidenceSourceDto = z.infer<typeof evidenceSourceDtoSchema>;
export type EvidenceCardStatus = z.infer<typeof evidenceCardStatusSchema>;
export type EvidenceTransitionAction = z.infer<
  typeof evidenceTransitionActionSchema
>;
