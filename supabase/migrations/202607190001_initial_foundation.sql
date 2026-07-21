-- SkillForge database foundation
--
-- This migration is intentionally BFF-only: browser roles receive no policies
-- or table privileges for these application tables. The Express backend uses the
-- Supabase service role after it has authenticated and authorized a request.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Controlled vocabularies
-- -----------------------------------------------------------------------------

CREATE TYPE public.context_pack AS ENUM (
  'software_product',
  'business_venture',
  'marketing_growth',
  'operations_process'
);

CREATE TYPE public.build_status AS ENUM (
  'draft',
  'active',
  'paused',
  'completed',
  'archived'
);

CREATE TYPE public.artifact_kind AS ENUM (
  'document',
  'repository',
  'design',
  'dataset',
  'metric_snapshot',
  'deployment',
  'campaign',
  'process_map',
  'sop',
  'other'
);

CREATE TYPE public.artifact_visibility AS ENUM (
  'private',
  'public_safe'
);

CREATE TYPE public.ai_run_purpose AS ENUM (
  'chat_response',
  'build_brief',
  'evidence_draft',
  'proof_plan',
  'skill_assessment',
  'context_compaction'
);

CREATE TYPE public.ai_run_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled'
);

CREATE TYPE public.evidence_card_status AS ENUM (
  'suggested',
  'confirmed',
  'linked',
  'outcome_supported',
  'dismissed',
  'revoked'
);

CREATE TYPE public.evidence_origin AS ENUM (
  'ai',
  'user',
  'import'
);

CREATE TYPE public.evidence_source_type AS ENUM (
  'user_explanation',
  'chat_message',
  'decision',
  'artifact',
  'task_output',
  'repository',
  'deployment',
  'metric_snapshot',
  'self_attestation',
  'external_credential',
  'public_outcome'
);

CREATE TYPE public.evidence_dimension AS ENUM (
  'exploration',
  'guided_execution',
  'independent_execution',
  'reasoning',
  'tradeoff',
  'measurement',
  'iteration',
  'outcome',
  'leadership'
);

CREATE TYPE public.evidence_event_type AS ENUM (
  'suggested',
  'edited',
  'confirmed',
  'linked',
  'outcome_supported',
  'dismissed',
  'revoked',
  'restored'
);

CREATE TYPE public.event_actor_type AS ENUM (
  'user',
  'system',
  'reviewer'
);

CREATE TYPE public.skill_level AS ENUM (
  'not_yet_assessed',
  'novice',
  'beginner',
  'intermediate',
  'advanced'
);

CREATE TYPE public.skill_proof_status AS ENUM (
  'unverified_estimate',
  'proof_linked',
  'source_validated',
  'independently_verified'
);

CREATE TYPE public.assessment_reason AS ENUM (
  'initial',
  'evidence_confirmed',
  'evidence_revoked',
  'proof_changed',
  'manual_recalculation'
);

CREATE TYPE public.assessment_actor_type AS ENUM (
  'system',
  'reviewer'
);

CREATE TYPE public.proof_plan_status AS ENUM (
  'suggested',
  'accepted',
  'in_progress',
  'completed',
  'dismissed',
  'cancelled'
);

CREATE TYPE public.proof_plan_origin AS ENUM (
  'ai',
  'user',
  'template'
);

CREATE TYPE public.proof_submission_status AS ENUM (
  'submitted',
  'self_attested_completed',
  'evidence_linked',
  'withdrawn'
);

CREATE TYPE public.external_proof_type AS ENUM (
  'public_repository',
  'certificate',
  'assessment_result',
  'public_outcome',
  'case_study',
  'deployment',
  'other'
);

CREATE TYPE public.external_proof_state AS ENUM (
  'linked',
  'source_validated',
  'independently_verified',
  'rejected',
  'revoked'
);

CREATE TYPE public.proof_check_type AS ENUM (
  'user_attestation',
  'url_format',
  'ownership_validation',
  'issuer_validation',
  'platform_result',
  'human_review'
);

CREATE TYPE public.proof_check_status AS ENUM (
  'pending',
  'passed',
  'failed',
  'not_applicable',
  'revoked'
);

CREATE TYPE public.share_page_status AS ENUM (
  'draft',
  'published',
  'revoked',
  'deleted'
);

CREATE TYPE public.share_page_item_type AS ENUM (
  'evidence',
  'artifact',
  'proof'
);

CREATE TYPE public.share_link_status AS ENUM (
  'active',
  'rotated',
  'revoked'
);

CREATE TYPE public.outbox_job_type AS ENUM (
  'draft_evidence',
  'recalculate_skill',
  'generate_proof_plan',
  'compact_context',
  'publish_share_snapshot',
  'revoke_publication'
);

CREATE TYPE public.outbox_job_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'dead_letter',
  'cancelled'
);

-- -----------------------------------------------------------------------------
-- Identity and capability taxonomy
-- -----------------------------------------------------------------------------

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  onboarding_data JSONB,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_display_name_length
    CHECK (display_name IS NULL OR char_length(display_name) <= 120),
  CONSTRAINT user_profiles_avatar_url_https
    CHECK (avatar_url IS NULL OR avatar_url ~ '^https://[^[:space:]]+$')
);

CREATE TABLE public.capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT capabilities_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT capabilities_name_length
    CHECK (char_length(name) BETWEEN 1 AND 160)
);

CREATE TABLE public.context_practices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  context_pack public.context_pack NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT context_practices_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT context_practices_name_length
    CHECK (char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT context_practices_context_slug_unique UNIQUE (context_pack, slug),
  CONSTRAINT context_practices_id_capability_unique UNIQUE (id, capability_id)
);

-- -----------------------------------------------------------------------------
-- Builds and durable, non-chat source material
-- -----------------------------------------------------------------------------

CREATE TABLE public.builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  primary_context_pack public.context_pack NOT NULL,
  outcome TEXT NOT NULL,
  definition_of_done TEXT,
  audience_or_stakeholder TEXT,
  role_statement TEXT,
  constraints_summary TEXT,
  metric_label TEXT,
  metric_unit TEXT,
  baseline_value NUMERIC,
  target_value NUMERIC,
  timebox_ends_at TIMESTAMPTZ,
  status public.build_status NOT NULL DEFAULT 'draft',
  evidence_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  brief_version INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT builds_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT builds_outcome_length
    CHECK (char_length(btrim(outcome)) BETWEEN 1 AND 4000),
  CONSTRAINT builds_role_length
    CHECK (role_statement IS NULL OR char_length(role_statement) <= 2000),
  CONSTRAINT builds_brief_version_positive CHECK (brief_version > 0),
  CONSTRAINT builds_completed_state
    CHECK (
      (status NOT IN ('completed', 'archived') OR completed_at IS NOT NULL)
      AND (completed_at IS NULL OR status IN ('completed', 'archived'))
    ),
  CONSTRAINT builds_archived_state
    CHECK (
      (status <> 'archived' OR archived_at IS NOT NULL)
      AND (archived_at IS NULL OR status = 'archived')
    ),
  CONSTRAINT builds_id_user_unique UNIQUE (id, user_id)
);

CREATE TABLE public.build_context_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_pack public.context_pack NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT build_context_packs_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT build_context_packs_unique UNIQUE (build_id, context_pack)
);

CREATE TABLE public.build_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.artifact_kind NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  external_url TEXT,
  storage_object_path TEXT,
  content_hash TEXT,
  visibility public.artifact_visibility NOT NULL DEFAULT 'private',
  share_permission_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT build_artifacts_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT build_artifacts_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  CONSTRAINT build_artifacts_summary_length
    CHECK (summary IS NULL OR char_length(summary) <= 8000),
  CONSTRAINT build_artifacts_url_https
    CHECK (external_url IS NULL OR external_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT build_artifacts_storage_path_relative
    CHECK (storage_object_path IS NULL OR storage_object_path !~ '(^/|//)'),
  CONSTRAINT build_artifacts_content_hash_length
    CHECK (content_hash IS NULL OR char_length(content_hash) BETWEEN 16 AND 128),
  CONSTRAINT build_artifacts_id_user_build_unique UNIQUE (id, user_id, build_id)
);

-- The app stores hashes, versions, usage, and structured metadata here. It does
-- not store raw prompts, raw model outputs, or authorization material in this table.
CREATE TABLE public.ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose public.ai_run_purpose NOT NULL,
  status public.ai_run_status NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  response_fingerprint TEXT,
  provider_response_id TEXT,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  schema_version TEXT,
  rubric_version TEXT,
  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd NUMERIC(12, 6),
  error_code TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_runs_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT ai_runs_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT ai_runs_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT ai_runs_id_user_build_unique UNIQUE (id, user_id, build_id),
  CONSTRAINT ai_runs_input_fingerprint_format
    CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ai_runs_response_fingerprint_format
    CHECK (response_fingerprint IS NULL OR response_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ai_runs_nonnegative_usage
    CHECK (
      (input_tokens IS NULL OR input_tokens >= 0)
      AND (output_tokens IS NULL OR output_tokens >= 0)
      AND (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0)
    ),
  CONSTRAINT ai_runs_terminal_timestamp
    CHECK (
      status NOT IN ('succeeded', 'failed', 'cancelled')
      OR completed_at IS NOT NULL
    )
);

-- -----------------------------------------------------------------------------
-- Evidence records
-- -----------------------------------------------------------------------------

CREATE TABLE public.evidence_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin public.evidence_origin NOT NULL DEFAULT 'ai',
  status public.evidence_card_status NOT NULL DEFAULT 'suggested',
  claim_summary TEXT NOT NULL,
  public_safe_summary TEXT,
  role_statement TEXT,
  generated_by_ai_run_id UUID,
  draft_schema_version TEXT,
  rubric_version TEXT,
  source_fingerprint TEXT,
  idempotency_key TEXT,
  reviewed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evidence_cards_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT evidence_cards_ai_run_owner
    FOREIGN KEY (generated_by_ai_run_id, user_id, build_id)
    REFERENCES public.ai_runs(id, user_id, build_id) ON DELETE SET NULL (generated_by_ai_run_id),
  CONSTRAINT evidence_cards_claim_length
    CHECK (char_length(btrim(claim_summary)) BETWEEN 1 AND 4000),
  CONSTRAINT evidence_cards_public_summary_length
    CHECK (public_safe_summary IS NULL OR char_length(public_safe_summary) <= 4000),
  CONSTRAINT evidence_cards_role_length
    CHECK (role_statement IS NULL OR char_length(role_statement) <= 2000),
  CONSTRAINT evidence_cards_fingerprint_format
    CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT evidence_cards_confirmed_timestamp
    CHECK (
      status NOT IN ('confirmed', 'linked', 'outcome_supported')
      OR confirmed_at IS NOT NULL
    ),
  CONSTRAINT evidence_cards_revoked_timestamp
    CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
  CONSTRAINT evidence_cards_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT evidence_cards_id_user_build_unique UNIQUE (id, user_id, build_id)
);

CREATE TABLE public.proof_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  context_practice_id UUID,
  origin public.proof_plan_origin NOT NULL DEFAULT 'ai',
  status public.proof_plan_status NOT NULL DEFAULT 'suggested',
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  completion_criteria TEXT NOT NULL,
  estimated_minutes INTEGER,
  generated_by_ai_run_id UUID,
  idempotency_key TEXT,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proof_plan_items_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT proof_plan_items_context_practice_capability
    FOREIGN KEY (context_practice_id, capability_id)
    REFERENCES public.context_practices(id, capability_id) ON DELETE RESTRICT,
  CONSTRAINT proof_plan_items_ai_run_owner
    FOREIGN KEY (generated_by_ai_run_id, user_id, build_id)
    REFERENCES public.ai_runs(id, user_id, build_id) ON DELETE SET NULL (generated_by_ai_run_id),
  CONSTRAINT proof_plan_items_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  CONSTRAINT proof_plan_items_estimate_positive
    CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  CONSTRAINT proof_plan_items_completed_timestamp
    CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CONSTRAINT proof_plan_items_id_user_build_unique UNIQUE (id, user_id, build_id)
);

CREATE TABLE public.external_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.external_proof_type NOT NULL,
  state public.external_proof_state NOT NULL DEFAULT 'linked',
  title TEXT NOT NULL,
  source_url TEXT,
  artifact_id UUID,
  issuer_name TEXT,
  credential_identifier TEXT,
  occurred_on DATE,
  connection_statement TEXT NOT NULL,
  public_safe_role_statement TEXT,
  sharing_permission_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  source_fingerprint TEXT,
  idempotency_key TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_proofs_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT external_proofs_artifact_owner
    FOREIGN KEY (artifact_id, user_id, build_id)
    REFERENCES public.build_artifacts(id, user_id, build_id) ON DELETE SET NULL (artifact_id),
  CONSTRAINT external_proofs_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  CONSTRAINT external_proofs_source_url_https
    CHECK (source_url IS NULL OR source_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT external_proofs_reference_required
    CHECK (source_url IS NOT NULL OR artifact_id IS NOT NULL OR credential_identifier IS NOT NULL),
  CONSTRAINT external_proofs_connection_length
    CHECK (char_length(btrim(connection_statement)) BETWEEN 1 AND 2000),
  CONSTRAINT external_proofs_role_length
    CHECK (public_safe_role_statement IS NULL OR char_length(public_safe_role_statement) <= 2000),
  CONSTRAINT external_proofs_fingerprint_format
    CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT external_proofs_revoked_timestamp
    CHECK (state <> 'revoked' OR revoked_at IS NOT NULL),
  CONSTRAINT external_proofs_id_user_build_unique UNIQUE (id, user_id, build_id)
);

CREATE TABLE public.evidence_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_card_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type public.evidence_source_type NOT NULL,
  source_label TEXT NOT NULL,
  source_reference TEXT,
  external_url TEXT,
  artifact_id UUID,
  external_proof_id UUID,
  source_excerpt TEXT,
  content_hash TEXT,
  occurred_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evidence_sources_card_owner
    FOREIGN KEY (evidence_card_id, user_id, build_id)
    REFERENCES public.evidence_cards(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT evidence_sources_artifact_owner
    FOREIGN KEY (artifact_id, user_id, build_id)
    REFERENCES public.build_artifacts(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT evidence_sources_external_proof_owner
    FOREIGN KEY (external_proof_id, user_id, build_id)
    REFERENCES public.external_proofs(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT evidence_sources_label_length
    CHECK (char_length(btrim(source_label)) BETWEEN 1 AND 240),
  CONSTRAINT evidence_sources_url_https
    CHECK (external_url IS NULL OR external_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT evidence_sources_excerpt_length
    CHECK (source_excerpt IS NULL OR char_length(source_excerpt) <= 8000),
  CONSTRAINT evidence_sources_hash_length
    CHECK (content_hash IS NULL OR char_length(content_hash) BETWEEN 16 AND 128),
  CONSTRAINT evidence_sources_locator_required
    CHECK (
      source_reference IS NOT NULL
      OR external_url IS NOT NULL
      OR artifact_id IS NOT NULL
      OR external_proof_id IS NOT NULL
      OR source_excerpt IS NOT NULL
      OR content_hash IS NOT NULL
    )
);

CREATE TABLE public.evidence_skill_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_card_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  context_practice_id UUID,
  coverage public.evidence_dimension[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evidence_skill_links_card_owner
    FOREIGN KEY (evidence_card_id, user_id, build_id)
    REFERENCES public.evidence_cards(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT evidence_skill_links_context_practice_capability
    FOREIGN KEY (context_practice_id, capability_id)
    REFERENCES public.context_practices(id, capability_id) ON DELETE RESTRICT,
  CONSTRAINT evidence_skill_links_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT evidence_skill_links_id_user_capability_unique UNIQUE (id, user_id, capability_id)
);

CREATE UNIQUE INDEX evidence_skill_links_card_capability_practice_unique
  ON public.evidence_skill_links (
    evidence_card_id,
    capability_id,
    COALESCE(context_practice_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE public.evidence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_card_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type public.evidence_event_type NOT NULL,
  actor_type public.event_actor_type NOT NULL,
  ai_run_id UUID,
  idempotency_key TEXT,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evidence_events_card_owner
    FOREIGN KEY (evidence_card_id, user_id, build_id)
    REFERENCES public.evidence_cards(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT evidence_events_ai_run_owner
    FOREIGN KEY (ai_run_id, user_id, build_id)
    REFERENCES public.ai_runs(id, user_id, build_id) ON DELETE SET NULL (ai_run_id)
);

-- -----------------------------------------------------------------------------
-- Explainable, evidence-derived skill overview
-- -----------------------------------------------------------------------------

CREATE TABLE public.skill_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  level public.skill_level NOT NULL DEFAULT 'not_yet_assessed',
  proof_status public.skill_proof_status NOT NULL DEFAULT 'unverified_estimate',
  rubric_version TEXT,
  accepted_evidence_count INTEGER NOT NULL DEFAULT 0,
  linked_proof_count INTEGER NOT NULL DEFAULT 0,
  last_assessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT skill_profiles_accepted_count_nonnegative CHECK (accepted_evidence_count >= 0),
  CONSTRAINT skill_profiles_proof_count_nonnegative CHECK (linked_proof_count >= 0),
  CONSTRAINT skill_profiles_user_capability_unique UNIQUE (user_id, capability_id),
  CONSTRAINT skill_profiles_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT skill_profiles_id_user_capability_unique UNIQUE (id, user_id, capability_id)
);

CREATE TABLE public.skill_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_profile_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  reason public.assessment_reason NOT NULL,
  calculated_by public.assessment_actor_type NOT NULL DEFAULT 'system',
  previous_level public.skill_level,
  calculated_level public.skill_level NOT NULL,
  rubric_version TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  explanation JSONB NOT NULL,
  ai_run_id UUID,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT skill_assessments_profile_owner
    FOREIGN KEY (skill_profile_id, user_id, capability_id)
    REFERENCES public.skill_profiles(id, user_id, capability_id) ON DELETE CASCADE,
  CONSTRAINT skill_assessments_ai_run_owner
    FOREIGN KEY (ai_run_id, user_id)
    REFERENCES public.ai_runs(id, user_id) ON DELETE SET NULL (ai_run_id),
  CONSTRAINT skill_assessments_fingerprint_format
    CHECK (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT skill_assessments_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT skill_assessments_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT skill_assessments_id_user_capability_unique UNIQUE (id, user_id, capability_id)
);

CREATE TABLE public.skill_assessment_evidence (
  assessment_id UUID NOT NULL,
  evidence_skill_link_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  inclusion_weight SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, evidence_skill_link_id),
  CONSTRAINT skill_assessment_evidence_assessment_owner
    FOREIGN KEY (assessment_id, user_id, capability_id)
    REFERENCES public.skill_assessments(id, user_id, capability_id) ON DELETE CASCADE,
  CONSTRAINT skill_assessment_evidence_link_owner
    FOREIGN KEY (evidence_skill_link_id, user_id, capability_id)
    REFERENCES public.evidence_skill_links(id, user_id, capability_id) ON DELETE CASCADE,
  CONSTRAINT skill_assessment_evidence_weight_range
    CHECK (inclusion_weight BETWEEN 1 AND 10)
);

-- -----------------------------------------------------------------------------
-- Proof-plan work and externally linked proof
-- -----------------------------------------------------------------------------

CREATE TABLE public.proof_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_plan_item_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.proof_submission_status NOT NULL DEFAULT 'submitted',
  completion_summary TEXT,
  artifact_id UUID,
  evidence_card_id UUID,
  external_proof_id UUID,
  external_url TEXT,
  self_attested_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proof_submissions_plan_owner
    FOREIGN KEY (proof_plan_item_id, user_id, build_id)
    REFERENCES public.proof_plan_items(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT proof_submissions_artifact_owner
    FOREIGN KEY (artifact_id, user_id, build_id)
    REFERENCES public.build_artifacts(id, user_id, build_id) ON DELETE SET NULL (artifact_id),
  CONSTRAINT proof_submissions_card_owner
    FOREIGN KEY (evidence_card_id, user_id, build_id)
    REFERENCES public.evidence_cards(id, user_id, build_id) ON DELETE SET NULL (evidence_card_id),
  CONSTRAINT proof_submissions_external_proof_owner
    FOREIGN KEY (external_proof_id, user_id, build_id)
    REFERENCES public.external_proofs(id, user_id, build_id) ON DELETE SET NULL (external_proof_id),
  CONSTRAINT proof_submissions_summary_length
    CHECK (completion_summary IS NULL OR char_length(completion_summary) <= 8000),
  CONSTRAINT proof_submissions_url_https
    CHECK (external_url IS NULL OR external_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT proof_submissions_self_attestation_timestamp
    CHECK (status <> 'self_attested_completed' OR self_attested_at IS NOT NULL),
  CONSTRAINT proof_submissions_withdrawn_timestamp
    CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
);

CREATE TABLE public.proof_skill_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_proof_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  context_practice_id UUID,
  evidence_card_id UUID,
  relevance_statement TEXT NOT NULL,
  role_statement TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proof_skill_links_proof_owner
    FOREIGN KEY (external_proof_id, user_id, build_id)
    REFERENCES public.external_proofs(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT proof_skill_links_card_owner
    FOREIGN KEY (evidence_card_id, user_id, build_id)
    REFERENCES public.evidence_cards(id, user_id, build_id) ON DELETE SET NULL (evidence_card_id),
  CONSTRAINT proof_skill_links_context_practice_capability
    FOREIGN KEY (context_practice_id, capability_id)
    REFERENCES public.context_practices(id, capability_id) ON DELETE RESTRICT,
  CONSTRAINT proof_skill_links_relevance_length
    CHECK (char_length(btrim(relevance_statement)) BETWEEN 1 AND 2000),
  CONSTRAINT proof_skill_links_role_length
    CHECK (role_statement IS NULL OR char_length(role_statement) <= 2000)
);

CREATE UNIQUE INDEX proof_skill_links_proof_capability_card_unique
  ON public.proof_skill_links (
    external_proof_id,
    capability_id,
    COALESCE(evidence_card_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE public.proof_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_proof_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_type public.proof_check_type NOT NULL,
  status public.proof_check_status NOT NULL DEFAULT 'pending',
  performed_by public.event_actor_type NOT NULL,
  idempotency_key TEXT,
  result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proof_checks_proof_owner
    FOREIGN KEY (external_proof_id, user_id, build_id)
    REFERENCES public.external_proofs(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT proof_checks_terminal_timestamp
    CHECK (
      status NOT IN ('passed', 'failed', 'not_applicable', 'revoked')
      OR checked_at IS NOT NULL
    )
);

-- -----------------------------------------------------------------------------
-- Explicit public-share publication snapshots
-- -----------------------------------------------------------------------------

CREATE TABLE public.share_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.share_page_status NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  narrative TEXT,
  publication_version INTEGER NOT NULL DEFAULT 1,
  redaction_reviewed_at TIMESTAMPTZ,
  sharing_notice_acknowledged_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT share_pages_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT share_pages_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  CONSTRAINT share_pages_narrative_length
    CHECK (narrative IS NULL OR char_length(narrative) <= 12000),
  CONSTRAINT share_pages_publication_version_positive CHECK (publication_version > 0),
  CONSTRAINT share_pages_published_timestamp
    CHECK (
      status <> 'published'
      OR (
        published_at IS NOT NULL
        AND redaction_reviewed_at IS NOT NULL
        AND sharing_notice_acknowledged_at IS NOT NULL
      )
    ),
  CONSTRAINT share_pages_revoked_timestamp
    CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
  CONSTRAINT share_pages_deleted_timestamp
    CHECK (status <> 'deleted' OR deleted_at IS NOT NULL),
  CONSTRAINT share_pages_id_user_build_unique UNIQUE (id, user_id, build_id)
);

CREATE TABLE public.share_page_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_page_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type public.share_page_item_type NOT NULL,
  evidence_card_id UUID,
  artifact_id UUID,
  external_proof_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  public_title TEXT NOT NULL,
  public_summary TEXT NOT NULL,
  source_label TEXT NOT NULL,
  publication_snapshot JSONB NOT NULL,
  redacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT share_page_items_page_owner
    FOREIGN KEY (share_page_id, user_id, build_id)
    REFERENCES public.share_pages(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT share_page_items_card_owner
    FOREIGN KEY (evidence_card_id, user_id, build_id)
    REFERENCES public.evidence_cards(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT share_page_items_artifact_owner
    FOREIGN KEY (artifact_id, user_id, build_id)
    REFERENCES public.build_artifacts(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT share_page_items_proof_owner
    FOREIGN KEY (external_proof_id, user_id, build_id)
    REFERENCES public.external_proofs(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT share_page_items_one_source
    CHECK (
      (CASE WHEN evidence_card_id IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN artifact_id IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN external_proof_id IS NULL THEN 0 ELSE 1 END) = 1
    ),
  CONSTRAINT share_page_items_source_matches_type
    CHECK (
      (item_type = 'evidence' AND evidence_card_id IS NOT NULL)
      OR (item_type = 'artifact' AND artifact_id IS NOT NULL)
      OR (item_type = 'proof' AND external_proof_id IS NOT NULL)
    ),
  CONSTRAINT share_page_items_sort_order_nonnegative CHECK (sort_order >= 0),
  CONSTRAINT share_page_items_title_length
    CHECK (char_length(btrim(public_title)) BETWEEN 1 AND 240),
  CONSTRAINT share_page_items_summary_length
    CHECK (char_length(btrim(public_summary)) BETWEEN 1 AND 8000),
  CONSTRAINT share_page_items_source_label_length
    CHECK (char_length(btrim(source_label)) BETWEEN 1 AND 240),
  CONSTRAINT share_page_items_page_sort_unique UNIQUE (share_page_id, sort_order)
);

CREATE TABLE public.share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_page_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.share_link_status NOT NULL DEFAULT 'active',
  token_digest TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  revoked_at TIMESTAMPTZ,
  rotated_from_id UUID,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT share_links_id_user_build_unique UNIQUE (id, user_id, build_id),
  CONSTRAINT share_links_page_owner
    FOREIGN KEY (share_page_id, user_id, build_id)
    REFERENCES public.share_pages(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT share_links_rotated_from_owner
    FOREIGN KEY (rotated_from_id, user_id, build_id)
    REFERENCES public.share_links(id, user_id, build_id) ON DELETE SET NULL (rotated_from_id),
  CONSTRAINT share_links_digest_format
    CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT share_links_hint_length
    CHECK (char_length(token_hint) BETWEEN 6 AND 16),
  CONSTRAINT share_links_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT share_links_revoked_timestamp
    CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- Durable jobs. A worker must claim and complete these atomically; no in-process
-- fire-and-forget work should be relied on for evidence or publication changes.
-- -----------------------------------------------------------------------------

CREATE TABLE public.outbox_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type public.outbox_job_type NOT NULL,
  status public.outbox_job_status NOT NULL DEFAULT 'pending',
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  completed_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outbox_jobs_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT outbox_jobs_aggregate_type_length
    CHECK (char_length(btrim(aggregate_type)) BETWEEN 1 AND 80),
  CONSTRAINT outbox_jobs_attempt_range
    CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts),
  CONSTRAINT outbox_jobs_terminal_timestamp
    CHECK (
      status NOT IN ('succeeded', 'dead_letter', 'cancelled')
      OR completed_at IS NOT NULL
    ),
  CONSTRAINT outbox_jobs_idempotency_unique UNIQUE (user_id, job_type, idempotency_key)
);

-- -----------------------------------------------------------------------------
-- Timestamps, indexes, and profile creation
-- -----------------------------------------------------------------------------

-- A revoked private record must not remain in a publication snapshot. These
-- triggers remove only the selected public item; the private evidence/proof and
-- its audit trail remain available to the owner unless they are deleted.
CREATE OR REPLACE FUNCTION public.remove_revoked_evidence_from_share_pages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'revoked' AND OLD.status IS DISTINCT FROM 'revoked' THEN
    UPDATE public.share_pages
      SET publication_version = publication_version + 1
      WHERE id IN (
        SELECT share_page_id
        FROM public.share_page_items
        WHERE evidence_card_id = NEW.id
      );

    DELETE FROM public.share_page_items
      WHERE evidence_card_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_revoked_proof_from_share_pages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.state = 'revoked' AND OLD.state IS DISTINCT FROM 'revoked' THEN
    UPDATE public.share_pages
      SET publication_version = publication_version + 1
      WHERE id IN (
        SELECT share_page_id
        FROM public.share_page_items
        WHERE external_proof_id = NEW.id
      );

    DELETE FROM public.share_page_items
      WHERE external_proof_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    NEW.id,
    NULLIF(LEFT(COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)), 120), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER capabilities_set_updated_at
  BEFORE UPDATE ON public.capabilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER context_practices_set_updated_at
  BEFORE UPDATE ON public.context_practices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER builds_set_updated_at
  BEFORE UPDATE ON public.builds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER build_artifacts_set_updated_at
  BEFORE UPDATE ON public.build_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER ai_runs_set_updated_at
  BEFORE UPDATE ON public.ai_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER evidence_cards_set_updated_at
  BEFORE UPDATE ON public.evidence_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER evidence_cards_remove_revoked_share_items
  AFTER UPDATE OF status ON public.evidence_cards
  FOR EACH ROW EXECUTE FUNCTION public.remove_revoked_evidence_from_share_pages();

CREATE TRIGGER proof_plan_items_set_updated_at
  BEFORE UPDATE ON public.proof_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER external_proofs_set_updated_at
  BEFORE UPDATE ON public.external_proofs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER external_proofs_remove_revoked_share_items
  AFTER UPDATE OF state ON public.external_proofs
  FOR EACH ROW EXECUTE FUNCTION public.remove_revoked_proof_from_share_pages();

CREATE TRIGGER skill_profiles_set_updated_at
  BEFORE UPDATE ON public.skill_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER proof_submissions_set_updated_at
  BEFORE UPDATE ON public.proof_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER share_pages_set_updated_at
  BEFORE UPDATE ON public.share_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER share_page_items_set_updated_at
  BEFORE UPDATE ON public.share_page_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER share_links_set_updated_at
  BEFORE UPDATE ON public.share_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER outbox_jobs_set_updated_at
  BEFORE UPDATE ON public.outbox_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX builds_user_status_created_idx
  ON public.builds (user_id, status, created_at DESC);
CREATE INDEX build_context_packs_user_build_idx
  ON public.build_context_packs (user_id, build_id);
CREATE INDEX build_artifacts_user_build_created_idx
  ON public.build_artifacts (user_id, build_id, created_at DESC);
CREATE INDEX ai_runs_user_build_created_idx
  ON public.ai_runs (user_id, build_id, created_at DESC);
CREATE INDEX ai_runs_pending_idx
  ON public.ai_runs (created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX evidence_cards_user_build_status_idx
  ON public.evidence_cards (user_id, build_id, status, created_at DESC);
CREATE UNIQUE INDEX evidence_cards_user_idempotency_key_unique
  ON public.evidence_cards (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX evidence_sources_card_created_idx
  ON public.evidence_sources (evidence_card_id, created_at);
CREATE INDEX evidence_skill_links_capability_idx
  ON public.evidence_skill_links (user_id, capability_id);
CREATE INDEX evidence_events_card_created_idx
  ON public.evidence_events (evidence_card_id, created_at);
CREATE UNIQUE INDEX evidence_events_user_idempotency_key_unique
  ON public.evidence_events (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX skill_profiles_user_level_idx
  ON public.skill_profiles (user_id, level);
CREATE INDEX skill_assessments_profile_created_idx
  ON public.skill_assessments (skill_profile_id, created_at DESC);
CREATE INDEX proof_plan_items_user_build_status_idx
  ON public.proof_plan_items (user_id, build_id, status, created_at DESC);
CREATE UNIQUE INDEX proof_plan_items_user_idempotency_key_unique
  ON public.proof_plan_items (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX proof_submissions_plan_created_idx
  ON public.proof_submissions (proof_plan_item_id, created_at DESC);
CREATE UNIQUE INDEX proof_submissions_user_idempotency_key_unique
  ON public.proof_submissions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX external_proofs_user_build_state_idx
  ON public.external_proofs (user_id, build_id, state, created_at DESC);
CREATE UNIQUE INDEX external_proofs_user_idempotency_key_unique
  ON public.external_proofs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX proof_skill_links_capability_idx
  ON public.proof_skill_links (user_id, capability_id);
CREATE INDEX proof_checks_proof_created_idx
  ON public.proof_checks (external_proof_id, created_at DESC);
CREATE UNIQUE INDEX proof_checks_user_idempotency_key_unique
  ON public.proof_checks (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX share_pages_user_build_status_idx
  ON public.share_pages (user_id, build_id, status, created_at DESC);
CREATE INDEX share_links_active_expiry_idx
  ON public.share_links (expires_at)
  WHERE status = 'active';
CREATE INDEX outbox_jobs_claim_idx
  ON public.outbox_jobs (available_at, created_at)
  WHERE status IN ('pending', 'failed');

-- -----------------------------------------------------------------------------
-- BFF-only access boundary
-- -----------------------------------------------------------------------------

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_context_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_skill_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_assessment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_skill_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_page_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_jobs ENABLE ROW LEVEL SECURITY;

REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE
  public.user_profiles,
  public.capabilities,
  public.context_practices,
  public.builds,
  public.build_context_packs,
  public.build_artifacts,
  public.ai_runs,
  public.evidence_cards,
  public.evidence_sources,
  public.evidence_skill_links,
  public.evidence_events,
  public.skill_profiles,
  public.skill_assessments,
  public.skill_assessment_evidence,
  public.proof_plan_items,
  public.proof_submissions,
  public.external_proofs,
  public.proof_skill_links,
  public.proof_checks,
  public.share_pages,
  public.share_page_items,
  public.share_links,
  public.outbox_jobs
FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO service_role;

GRANT USAGE ON TYPE
  public.context_pack,
  public.build_status,
  public.artifact_kind,
  public.artifact_visibility,
  public.ai_run_purpose,
  public.ai_run_status,
  public.evidence_card_status,
  public.evidence_origin,
  public.evidence_source_type,
  public.evidence_dimension,
  public.evidence_event_type,
  public.event_actor_type,
  public.skill_level,
  public.skill_proof_status,
  public.assessment_reason,
  public.assessment_actor_type,
  public.proof_plan_status,
  public.proof_plan_origin,
  public.proof_submission_status,
  public.external_proof_type,
  public.external_proof_state,
  public.proof_check_type,
  public.proof_check_status,
  public.share_page_status,
  public.share_page_item_type,
  public.share_link_status,
  public.outbox_job_type,
  public.outbox_job_status
TO service_role;

GRANT ALL PRIVILEGES ON TABLE
  public.user_profiles,
  public.capabilities,
  public.context_practices,
  public.builds,
  public.build_context_packs,
  public.build_artifacts,
  public.ai_runs,
  public.evidence_cards,
  public.evidence_sources,
  public.evidence_skill_links,
  public.evidence_events,
  public.skill_profiles,
  public.skill_assessments,
  public.skill_assessment_evidence,
  public.proof_plan_items,
  public.proof_submissions,
  public.external_proofs,
  public.proof_skill_links,
  public.proof_checks,
  public.share_pages,
  public.share_page_items,
  public.share_links,
  public.outbox_jobs
TO service_role;
