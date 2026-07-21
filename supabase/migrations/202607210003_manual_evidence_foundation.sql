-- M3a: controlled capability taxonomy plus the first owner-scoped manual
-- evidence workflow. This migration is additive and follows the fresh-database
-- foundation migrations.

-- -----------------------------------------------------------------------------
-- Explicit provenance for future persisted skill estimates
-- -----------------------------------------------------------------------------

CREATE TYPE public.skill_estimate_basis AS ENUM (
  'brief_derived',
  'evidence_derived'
);

ALTER TABLE public.skill_profiles
  ADD COLUMN assessment_basis public.skill_estimate_basis
    NOT NULL DEFAULT 'evidence_derived';

-- -----------------------------------------------------------------------------
-- Controlled capability and context-practice vocabulary
-- -----------------------------------------------------------------------------

INSERT INTO public.capabilities (slug, name, description)
VALUES
  ('product-discovery', 'Product discovery', 'Frame a user problem, outcome, and learning question before delivery.'),
  ('solution-architecture', 'Solution architecture', 'Design the technical or operational shape of a solution.'),
  ('software-delivery', 'Software delivery', 'Plan, build, test, and release a software outcome.'),
  ('mobile-app-development', 'Mobile app development', 'Build and iterate native or cross-platform mobile applications.'),
  ('game-development', 'Game development', 'Design and build interactive game experiences and systems.'),
  ('backend-development', 'Backend development', 'Design and implement server-side services, APIs, and data flows.'),
  ('frontend-development', 'Frontend development', 'Design and implement user-facing web interfaces.'),
  ('cloud-engineering', 'Cloud engineering', 'Operate reliable cloud infrastructure and delivery environments.'),
  ('applied-ai-development', 'Applied AI development', 'Apply AI systems responsibly within a practical product workflow.'),
  ('customer-research', 'Customer research', 'Learn from customers, users, and a market before committing to a direction.'),
  ('offer-design', 'Offer design', 'Define a useful offer, value exchange, and buyer-facing proposition.'),
  ('strategic-planning', 'Strategic planning', 'Set a coherent direction, priorities, and measurable choices.'),
  ('customer-discovery', 'Customer discovery', 'Test customer problems and assumptions through direct discovery work.'),
  ('pricing-strategy', 'Pricing strategy', 'Develop and test pricing, packaging, and willingness-to-pay hypotheses.'),
  ('sales-development', 'Sales development', 'Create and improve a practical prospecting and sales process.'),
  ('business-modelling', 'Business modelling', 'Reason about value creation, delivery, revenue, and unit economics.'),
  ('audience-research', 'Audience research', 'Identify an audience, its needs, and reachable channels.'),
  ('campaign-strategy', 'Campaign strategy', 'Plan a campaign around an objective, audience, message, and channel mix.'),
  ('marketing-analytics', 'Marketing analytics', 'Measure marketing activity and use the findings to improve decisions.'),
  ('social-media-marketing', 'Social media marketing', 'Plan, create, and improve social-channel communication.'),
  ('search-engine-optimization', 'Search engine optimization', 'Improve organic discoverability through search-oriented work.'),
  ('email-marketing', 'Email marketing', 'Plan and improve opt-in email communication and lifecycle journeys.'),
  ('content-marketing', 'Content marketing', 'Create and improve useful content for a defined audience.'),
  ('performance-marketing', 'Performance marketing', 'Run and measure paid acquisition or conversion activity.'),
  ('process-mapping', 'Process mapping', 'Document a current process, its handoffs, and points of friction.'),
  ('workflow-design', 'Workflow design', 'Design repeatable ways of working across people and systems.'),
  ('operational-measurement', 'Operational measurement', 'Define and use operational measures to guide improvement.'),
  ('workflow-automation', 'Workflow automation', 'Automate repeatable work while preserving meaningful human checks.'),
  ('process-improvement', 'Process improvement', 'Identify and improve constraints, quality, or efficiency in a process.'),
  ('operations-analytics', 'Operations analytics', 'Analyze operational data to make better process decisions.'),
  ('operational-planning', 'Operational planning', 'Plan capacity, sequencing, and resources for reliable execution.')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = TRUE;

WITH seeded_practices (context_pack, capability_slug, slug, name, description) AS (
  VALUES
    ('software_product', 'product-discovery', 'product-discovery', 'Product discovery', 'Clarify the problem, intended outcome, and learning question for a software product.'),
    ('software_product', 'solution-architecture', 'solution-architecture', 'Solution architecture', 'Shape the main systems, boundaries, and technical decisions for a software product.'),
    ('software_product', 'software-delivery', 'software-delivery', 'Software delivery', 'Move a software outcome from an executable plan through a tested delivery.'),
    ('software_product', 'mobile-app-development', 'mobile-app-development', 'Mobile app development', 'Build and iterate a mobile application.'),
    ('software_product', 'game-development', 'game-development', 'Game development', 'Build an interactive game or game-adjacent experience.'),
    ('software_product', 'backend-development', 'backend-development', 'Backend development', 'Build server-side APIs, services, or data flows.'),
    ('software_product', 'frontend-development', 'frontend-development', 'Frontend development', 'Build a web-facing user interface.'),
    ('software_product', 'cloud-engineering', 'cloud-engineering', 'Cloud engineering', 'Operate cloud infrastructure or a delivery environment.'),
    ('software_product', 'applied-ai-development', 'applied-ai-development', 'Applied AI development', 'Apply an AI capability within a practical product workflow.'),
    ('business_venture', 'customer-research', 'customer-research', 'Customer research', 'Learn about potential customers before making a business decision.'),
    ('business_venture', 'offer-design', 'offer-design', 'Offer design', 'Define an offer and the customer value it intends to create.'),
    ('business_venture', 'strategic-planning', 'strategic-planning', 'Strategic planning', 'Set business direction, priorities, and measurable choices.'),
    ('business_venture', 'customer-discovery', 'customer-discovery', 'Customer discovery', 'Test a customer problem or assumption through direct discovery work.'),
    ('business_venture', 'pricing-strategy', 'pricing-strategy', 'Pricing strategy', 'Test pricing or packaging assumptions.'),
    ('business_venture', 'sales-development', 'sales-development', 'Sales development', 'Create a practical prospecting and sales process.'),
    ('business_venture', 'business-modelling', 'business-modelling', 'Business modelling', 'Reason about value creation, delivery, revenue, and unit economics.'),
    ('marketing_growth', 'audience-research', 'audience-research', 'Audience research', 'Identify an audience, need, and reachable channel.'),
    ('marketing_growth', 'campaign-strategy', 'campaign-strategy', 'Campaign strategy', 'Plan a campaign around an objective, audience, message, and channel mix.'),
    ('marketing_growth', 'marketing-analytics', 'marketing-analytics', 'Marketing analytics', 'Measure marketing activity and apply the findings.'),
    ('marketing_growth', 'social-media-marketing', 'social-media-marketing', 'Social media marketing', 'Plan or improve social-channel communication.'),
    ('marketing_growth', 'search-engine-optimization', 'search-engine-optimization', 'Search engine optimization', 'Improve organic discoverability through search-oriented work.'),
    ('marketing_growth', 'email-marketing', 'email-marketing', 'Email marketing', 'Plan or improve opt-in email communication.'),
    ('marketing_growth', 'content-marketing', 'content-marketing', 'Content marketing', 'Create useful content for a defined audience.'),
    ('marketing_growth', 'performance-marketing', 'performance-marketing', 'Performance marketing', 'Run and measure paid acquisition or conversion activity.'),
    ('operations_process', 'process-mapping', 'process-mapping', 'Process mapping', 'Document the current process, handoffs, and friction.'),
    ('operations_process', 'workflow-design', 'workflow-design', 'Workflow design', 'Design a repeatable workflow across people and systems.'),
    ('operations_process', 'operational-measurement', 'operational-measurement', 'Operational measurement', 'Define and use operational measures to guide improvement.'),
    ('operations_process', 'workflow-automation', 'workflow-automation', 'Workflow automation', 'Automate repeatable work while preserving meaningful human checks.'),
    ('operations_process', 'process-improvement', 'process-improvement', 'Process improvement', 'Improve a process constraint, quality concern, or efficiency issue.'),
    ('operations_process', 'operations-analytics', 'operations-analytics', 'Operations analytics', 'Analyze operational data to improve a process decision.'),
    ('operations_process', 'operational-planning', 'operational-planning', 'Operational planning', 'Plan capacity, sequencing, or resources for reliable operations.')
)
INSERT INTO public.context_practices (
  capability_id,
  context_pack,
  slug,
  name,
  description
)
SELECT
  capability.id,
  practice.context_pack::public.context_pack,
  practice.slug,
  practice.name,
  practice.description
FROM seeded_practices AS practice
JOIN public.capabilities AS capability
  ON capability.slug = practice.capability_slug
ON CONFLICT (context_pack, slug) DO UPDATE
SET
  capability_id = EXCLUDED.capability_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = TRUE;

-- -----------------------------------------------------------------------------
-- Private, manual evidence cards
-- -----------------------------------------------------------------------------

CREATE TYPE public.evidence_contribution AS ENUM (
  'individual',
  'team'
);

ALTER TABLE public.evidence_cards
  ADD COLUMN contribution public.evidence_contribution
    NOT NULL DEFAULT 'individual',
  ADD CONSTRAINT evidence_cards_team_role_required
    CHECK (
      contribution <> 'team'
      OR (role_statement IS NOT NULL AND char_length(btrim(role_statement)) > 0)
    );

-- These functions are deliberately narrow. The server uses its service-role
-- client, supplies the verified owner ID itself, and re-reads the row under
-- that owner/build scope before returning it to the browser. The database
-- transaction ensures card, source, and append-only event are created or
-- transitioned together.

CREATE OR REPLACE FUNCTION public.create_manual_evidence_card(
  p_user_id UUID,
  p_build_id UUID,
  p_claim_summary TEXT,
  p_contribution public.evidence_contribution,
  p_role_statement TEXT,
  p_source_label TEXT,
  p_source_excerpt TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  evidence public.evidence_cards%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO evidence
    FROM public.evidence_cards
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      IF evidence.build_id <> p_build_id THEN
        RAISE EXCEPTION 'Evidence idempotency key belongs to another build';
      END IF;

      RETURN QUERY SELECT evidence.id;
      RETURN;
    END IF;
  END IF;

  -- The ownership check intentionally happens inside the transaction as well
  -- as in the HTTP repository. A missing and non-owned build both return no
  -- row, which the BFF maps to the same generic 404.
  IF NOT EXISTS (
    SELECT 1
    FROM public.builds
    WHERE id = p_build_id
      AND user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.evidence_cards (
    build_id,
    user_id,
    origin,
    status,
    claim_summary,
    role_statement,
    contribution,
    idempotency_key
  )
  VALUES (
    p_build_id,
    p_user_id,
    'user',
    'suggested',
    btrim(p_claim_summary),
    NULLIF(btrim(p_role_statement), ''),
    p_contribution,
    p_idempotency_key
  )
  RETURNING * INTO evidence;

  INSERT INTO public.evidence_sources (
    evidence_card_id,
    build_id,
    user_id,
    source_type,
    source_label,
    source_excerpt
  )
  VALUES (
    evidence.id,
    p_build_id,
    p_user_id,
    'self_attestation',
    btrim(p_source_label),
    btrim(p_source_excerpt)
  );

  INSERT INTO public.evidence_events (
    evidence_card_id,
    build_id,
    user_id,
    event_type,
    actor_type,
    idempotency_key,
    event_metadata
  )
  VALUES (
    evidence.id,
    p_build_id,
    p_user_id,
    'suggested',
    'user',
    p_idempotency_key,
    jsonb_build_object('origin', 'manual')
  );

  RETURN QUERY SELECT evidence.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_manual_evidence_card(
  p_user_id UUID,
  p_build_id UUID,
  p_evidence_card_id UUID,
  p_action TEXT,
  p_revocation_reason TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  evidence public.evidence_cards%ROWTYPE;
  next_status public.evidence_card_status;
  next_event public.evidence_event_type;
BEGIN
  SELECT *
  INTO evidence
  FROM public.evidence_cards
  WHERE id = p_evidence_card_id
    AND build_id = p_build_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  CASE p_action
    WHEN 'confirm' THEN
      next_status := 'confirmed';
      next_event := 'confirmed';
      IF evidence.status = next_status THEN
        RETURN QUERY SELECT evidence.id;
        RETURN;
      END IF;
      IF evidence.status <> 'suggested' THEN
        RETURN;
      END IF;

      UPDATE public.evidence_cards
      SET
        status = next_status,
        reviewed_at = now(),
        confirmed_at = now(),
        revoked_at = NULL,
        revocation_reason = NULL
      WHERE id = evidence.id
      RETURNING * INTO evidence;

    WHEN 'dismiss' THEN
      next_status := 'dismissed';
      next_event := 'dismissed';
      IF evidence.status = next_status THEN
        RETURN QUERY SELECT evidence.id;
        RETURN;
      END IF;
      IF evidence.status <> 'suggested' THEN
        RETURN;
      END IF;

      UPDATE public.evidence_cards
      SET
        status = next_status,
        reviewed_at = now()
      WHERE id = evidence.id
      RETURNING * INTO evidence;

    WHEN 'revoke' THEN
      next_status := 'revoked';
      next_event := 'revoked';
      IF evidence.status = next_status THEN
        RETURN QUERY SELECT evidence.id;
        RETURN;
      END IF;
      IF evidence.status NOT IN ('confirmed', 'linked', 'outcome_supported') THEN
        RETURN;
      END IF;

      UPDATE public.evidence_cards
      SET
        status = next_status,
        revoked_at = now(),
        revocation_reason = NULLIF(btrim(p_revocation_reason), '')
      WHERE id = evidence.id
      RETURNING * INTO evidence;

    ELSE
      RAISE EXCEPTION 'Unsupported evidence action';
  END CASE;

  INSERT INTO public.evidence_events (
    evidence_card_id,
    build_id,
    user_id,
    event_type,
    actor_type,
    event_metadata
  )
  VALUES (
    evidence.id,
    p_build_id,
    p_user_id,
    next_event,
    'user',
    CASE
      WHEN next_event = 'revoked' AND NULLIF(btrim(p_revocation_reason), '') IS NOT NULL
        THEN jsonb_build_object('reason', btrim(p_revocation_reason))
      ELSE '{}'::jsonb
    END
  );

  RETURN QUERY SELECT evidence.id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_evidence_card(
  UUID,
  UUID,
  TEXT,
  public.evidence_contribution,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.transition_manual_evidence_card(
  UUID,
  UUID,
  UUID,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT USAGE ON TYPE public.skill_estimate_basis, public.evidence_contribution
TO service_role;

GRANT EXECUTE ON FUNCTION public.create_manual_evidence_card(
  UUID,
  UUID,
  TEXT,
  public.evidence_contribution,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO service_role;

GRANT EXECUTE ON FUNCTION public.transition_manual_evidence_card(
  UUID,
  UUID,
  UUID,
  TEXT,
  TEXT
) TO service_role;
