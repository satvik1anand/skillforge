-- Fix the first manual-evidence RPC definitions. Their `RETURNS TABLE (id)`
-- output parameter is also a PL/pgSQL variable, so every table `id` reference
-- inside the function must be qualified to avoid an ambiguous-column error.

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
    SELECT evidence_card.*
    INTO evidence
    FROM public.evidence_cards AS evidence_card
    WHERE evidence_card.user_id = p_user_id
      AND evidence_card.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      IF evidence.build_id <> p_build_id THEN
        RAISE EXCEPTION 'Evidence idempotency key belongs to another build';
      END IF;

      RETURN QUERY SELECT evidence.id AS id;
      RETURN;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.builds AS owned_build
    WHERE owned_build.id = p_build_id
      AND owned_build.user_id = p_user_id
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

  RETURN QUERY SELECT evidence.id AS id;
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
  SELECT evidence_card.*
  INTO evidence
  FROM public.evidence_cards AS evidence_card
  WHERE evidence_card.id = p_evidence_card_id
    AND evidence_card.build_id = p_build_id
    AND evidence_card.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  CASE p_action
    WHEN 'confirm' THEN
      next_status := 'confirmed';
      next_event := 'confirmed';
      IF evidence.status = next_status THEN
        RETURN QUERY SELECT evidence.id AS id;
        RETURN;
      END IF;
      IF evidence.status <> 'suggested' THEN
        RETURN;
      END IF;

      UPDATE public.evidence_cards AS evidence_card
      SET
        status = next_status,
        reviewed_at = now(),
        confirmed_at = now(),
        revoked_at = NULL,
        revocation_reason = NULL
      WHERE evidence_card.id = evidence.id
      RETURNING * INTO evidence;

    WHEN 'dismiss' THEN
      next_status := 'dismissed';
      next_event := 'dismissed';
      IF evidence.status = next_status THEN
        RETURN QUERY SELECT evidence.id AS id;
        RETURN;
      END IF;
      IF evidence.status <> 'suggested' THEN
        RETURN;
      END IF;

      UPDATE public.evidence_cards AS evidence_card
      SET
        status = next_status,
        reviewed_at = now()
      WHERE evidence_card.id = evidence.id
      RETURNING * INTO evidence;

    WHEN 'revoke' THEN
      next_status := 'revoked';
      next_event := 'revoked';
      IF evidence.status = next_status THEN
        RETURN QUERY SELECT evidence.id AS id;
        RETURN;
      END IF;
      IF evidence.status NOT IN ('confirmed', 'linked', 'outcome_supported') THEN
        RETURN;
      END IF;

      UPDATE public.evidence_cards AS evidence_card
      SET
        status = next_status,
        revoked_at = now(),
        revocation_reason = NULLIF(btrim(p_revocation_reason), '')
      WHERE evidence_card.id = evidence.id
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

  RETURN QUERY SELECT evidence.id AS id;
END;
$$;
