-- M5a follow-up: this is intentionally separate from the enum addition in
-- 202607210005. PostgreSQL does not allow a newly added enum value to be used
-- safely in the same transaction that adds it.

CREATE OR REPLACE FUNCTION public.skillforge_skill_level_rank(
  p_level public.skill_level
)
RETURNS SMALLINT
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_level::TEXT
    WHEN 'not_yet_assessed' THEN 0
    WHEN 'novice' THEN 1
    WHEN 'beginner' THEN 2
    WHEN 'intermediate' THEN 3
    WHEN 'advanced' THEN 4
    ELSE -1
  END::SMALLINT;
$$;

CREATE OR REPLACE FUNCTION public.record_chat_skill_inference(
  p_user_id UUID,
  p_build_id UUID,
  p_conversation_id UUID,
  p_source_message_id UUID,
  p_capability_id UUID,
  p_context_practice_id UUID,
  p_inferred_level public.skill_level,
  p_rationale TEXT,
  p_signal_dimensions public.evidence_dimension[],
  p_ai_run_id UUID DEFAULT NULL
)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  source_message public.build_messages%ROWTYPE;
  existing_inference public.chat_skill_inferences%ROWTYPE;
  current_profile public.skill_profiles%ROWTYPE;
  build_context public.context_pack;
  previous_level public.skill_level;
  applied_level public.skill_level;
  maximum_one_step_level public.skill_level;
  did_raise BOOLEAN := FALSE;
  inserted_inference public.chat_skill_inferences%ROWTYPE;
BEGIN
  IF p_inferred_level = 'not_yet_assessed' THEN
    RAISE EXCEPTION 'A chat inference must contain an assessed level';
  END IF;

  IF char_length(btrim(p_rationale)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'A chat inference rationale is outside the allowed bounds';
  END IF;

  -- The source is owner, Build, conversation, and role scoped in the same
  -- transaction. A missing or non-owned message returns no row; the BFF maps
  -- this to its generic persistence failure and never leaks another user's
  -- message existence.
  SELECT message.*
  INTO source_message
  FROM public.build_messages AS message
  WHERE message.id = p_source_message_id
    AND message.user_id = p_user_id
    AND message.build_id = p_build_id
    AND message.conversation_id = p_conversation_id
    AND message.role = 'user';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT build.primary_context_pack
  INTO build_context
  FROM public.builds AS build
  WHERE build.id = p_build_id
    AND build.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A model may select only a controlled, active practice that belongs to the
  -- active Build context and its matching capability.
  IF NOT EXISTS (
    SELECT 1
    FROM public.context_practices AS practice
    WHERE practice.id = p_context_practice_id
      AND practice.capability_id = p_capability_id
      AND practice.context_pack = build_context
      AND practice.is_active = TRUE
  ) THEN
    RETURN;
  END IF;

  SELECT inference.*
  INTO existing_inference
  FROM public.chat_skill_inferences AS inference
  WHERE inference.source_message_id = p_source_message_id;

  IF FOUND THEN
    RETURN QUERY SELECT existing_inference.id AS id;
    RETURN;
  END IF;

  -- Lock this private profile while applying the one-step anti-jump rule. The
  -- profile's proof status is never modified here; verified/proof-linked
  -- profiles cannot be changed by a chat inference at all.
  SELECT profile.*
  INTO current_profile
  FROM public.skill_profiles AS profile
  WHERE profile.user_id = p_user_id
    AND profile.capability_id = p_capability_id
  FOR UPDATE;

  IF NOT FOUND THEN
    previous_level := 'not_yet_assessed';
    -- A first observation can establish only a Novice estimate, even if a
    -- single message uses advanced terminology.
    applied_level := 'novice';
    did_raise := TRUE;

    INSERT INTO public.skill_profiles (
      user_id,
      capability_id,
      level,
      proof_status,
      assessment_basis,
      rubric_version,
      last_assessed_at
    )
    VALUES (
      p_user_id,
      p_capability_id,
      applied_level,
      'unverified_estimate',
      'chat_inferred',
      'build-companion-inference-v1',
      now()
    );
  ELSE
    previous_level := current_profile.level;
    applied_level := current_profile.level;

    IF current_profile.proof_status = 'unverified_estimate'
      AND public.skillforge_skill_level_rank(p_inferred_level)
        > public.skillforge_skill_level_rank(current_profile.level) THEN
      maximum_one_step_level := CASE current_profile.level
        WHEN 'not_yet_assessed' THEN 'novice'
        WHEN 'novice' THEN 'beginner'
        WHEN 'beginner' THEN 'intermediate'
        WHEN 'intermediate' THEN 'advanced'
        WHEN 'advanced' THEN 'advanced'
      END;

      applied_level := CASE
        WHEN public.skillforge_skill_level_rank(p_inferred_level)
          > public.skillforge_skill_level_rank(maximum_one_step_level)
          THEN maximum_one_step_level
        ELSE p_inferred_level
      END;

      IF applied_level <> current_profile.level THEN
        UPDATE public.skill_profiles AS profile
        SET
          level = applied_level,
          proof_status = 'unverified_estimate',
          assessment_basis = 'chat_inferred',
          rubric_version = 'build-companion-inference-v1',
          last_assessed_at = now()
        WHERE profile.id = current_profile.id;
        did_raise := TRUE;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.chat_skill_inferences (
    build_id,
    user_id,
    conversation_id,
    source_message_id,
    source_message_content_hash,
    capability_id,
    context_practice_id,
    inferred_level,
    previous_level,
    applied_level,
    level_raised,
    proof_status,
    rationale,
    signal_dimensions,
    generated_by_ai_run_id
  )
  VALUES (
    p_build_id,
    p_user_id,
    p_conversation_id,
    p_source_message_id,
    source_message.content_hash,
    p_capability_id,
    p_context_practice_id,
    p_inferred_level,
    previous_level,
    applied_level,
    did_raise,
    'unverified_estimate',
    btrim(p_rationale),
    COALESCE(p_signal_dimensions, '{}'),
    p_ai_run_id
  )
  ON CONFLICT (source_message_id) DO NOTHING
  RETURNING * INTO inserted_inference;

  IF NOT FOUND THEN
    -- A concurrent retry can race after the profile row lock is released.
    -- Preserve the first exact-message inference rather than creating an
    -- ambiguous second provenance record.
    SELECT inference.*
    INTO inserted_inference
    FROM public.chat_skill_inferences AS inference
    WHERE inference.source_message_id = p_source_message_id;
  END IF;

  RETURN QUERY SELECT inserted_inference.id AS id;
END;
$$;

REVOKE ALL ON FUNCTION public.skillforge_skill_level_rank(public.skill_level)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.skillforge_skill_level_rank(public.skill_level)
TO service_role;

REVOKE ALL ON FUNCTION public.record_chat_skill_inference(
  UUID,
  UUID,
  UUID,
  UUID,
  UUID,
  UUID,
  public.skill_level,
  TEXT,
  public.evidence_dimension[],
  UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_chat_skill_inference(
  UUID,
  UUID,
  UUID,
  UUID,
  UUID,
  UUID,
  public.skill_level,
  TEXT,
  public.evidence_dimension[],
  UUID
) TO service_role;
