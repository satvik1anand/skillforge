import { z } from "zod";

/**
 * The first Build Brief is intentionally lightweight. It maps directly to the
 * fresh-database foundation and keeps sensitive evidence, artifacts, chats,
 * and publication choices out of a general build-create request.
 */

export const buildContextPackValues = [
  "software_product",
  "business_venture",
  "marketing_growth",
  "operations_process",
] as const;

export const buildStatusValues = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export const buildContextPackSchema = z.enum(buildContextPackValues);
export const buildStatusSchema = z.enum(buildStatusValues);

const buildIdSchema = z.string().uuid();
const revisionSchema = z.number().int().min(1).max(2_147_483_647);
const expectedRevisionSchema = z.number().int().min(1).max(2_147_483_646);
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

export const buildTitleSchema = text("Title", 1, 160);
export const buildOutcomeSchema = text("Outcome", 1, 4_000);
export const buildRoleStatementSchema = optionalText("Role statement", 2_000);
export const buildAudienceSchema = optionalText("Audience or stakeholder", 1_000);
export const buildConstraintsSummarySchema = optionalText(
  "Constraints summary",
  4_000,
);
export const buildDefinitionOfDoneSchema = optionalText(
  "Definition of done",
  4_000,
);
export const buildMetricLabelSchema = optionalText("Metric label", 120);
export const buildMetricUnitSchema = optionalText("Metric unit", 40);

export const buildMetricInputSchema = z
  .object({
    label: text("Metric label", 1, 120),
    unit: buildMetricUnitSchema,
    baselineValue: z.number().finite().optional(),
    targetValue: z.number().finite().optional(),
  })
  .strict();

const mutableBuildBriefSchema = z
  .object({
    title: buildTitleSchema,
    primaryContextPack: buildContextPackSchema,
    outcome: buildOutcomeSchema,
    audienceOrStakeholder: buildAudienceSchema,
    roleStatement: buildRoleStatementSchema,
    constraintsSummary: buildConstraintsSummarySchema,
    definitionOfDone: buildDefinitionOfDoneSchema,
    metric: buildMetricInputSchema.optional(),
    timeboxEndsAt: isoTimestampSchema.optional(),
    evidenceCaptureEnabled: z.boolean().default(false),
  })
  .strict();

export const createBuildBriefRequestSchema = mutableBuildBriefSchema;

export const updateBuildBriefRequestSchema = z
  .object({
    expectedRevision: expectedRevisionSchema,
    title: buildTitleSchema.optional(),
    primaryContextPack: buildContextPackSchema.optional(),
    outcome: buildOutcomeSchema.optional(),
    audienceOrStakeholder: buildAudienceSchema,
    roleStatement: buildRoleStatementSchema,
    constraintsSummary: buildConstraintsSummarySchema,
    definitionOfDone: buildDefinitionOfDoneSchema,
    metric: buildMetricInputSchema.optional(),
    timeboxEndsAt: isoTimestampSchema.optional(),
    evidenceCaptureEnabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const { expectedRevision: _expectedRevision, ...fields } = value;
    if (Object.values(fields).every((field) => field === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one Build Brief field to update.",
      });
    }

  });

export const buildIdParamsSchema = z.object({ id: buildIdSchema }).strict();

export const buildBriefDtoSchema = z
  .object({
    id: buildIdSchema,
    revision: revisionSchema,
    status: buildStatusSchema,
    title: buildTitleSchema,
    primaryContextPack: buildContextPackSchema,
    outcome: buildOutcomeSchema,
    audienceOrStakeholder: buildAudienceSchema,
    roleStatement: buildRoleStatementSchema,
    constraintsSummary: buildConstraintsSummarySchema,
    definitionOfDone: buildDefinitionOfDoneSchema,
    metric: buildMetricInputSchema.nullable(),
    timeboxEndsAt: isoTimestampSchema.nullable(),
    evidenceCaptureEnabled: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const buildBriefResponseSchema = z
  .object({ data: z.object({ buildBrief: buildBriefDtoSchema }).strict() })
  .strict();

export const buildBriefListQuerySchema = z
  .object({
    limit: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : value,
        z.number().int().min(1).max(50).optional(),
      ),
    status: buildStatusSchema.optional(),
  })
  .strict();

export const buildBriefListResponseSchema = z
  .object({
    data: z
      .object({
        items: z.array(buildBriefDtoSchema).max(50),
      })
      .strict(),
  })
  .strict();

export type BuildContextPack = z.infer<typeof buildContextPackSchema>;
export type BuildStatus = z.infer<typeof buildStatusSchema>;
export type BuildMetricInput = z.infer<typeof buildMetricInputSchema>;
export type CreateBuildBriefRequest = z.infer<
  typeof createBuildBriefRequestSchema
>;
export type UpdateBuildBriefRequest = z.infer<
  typeof updateBuildBriefRequestSchema
>;
export type BuildBriefDto = z.infer<typeof buildBriefDtoSchema>;
export type BuildBriefListQuery = z.infer<typeof buildBriefListQuerySchema>;
