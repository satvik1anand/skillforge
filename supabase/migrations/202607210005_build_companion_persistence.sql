-- M5a: Build-aware assistant persistence. Conversations and their derived
-- private skill estimates remain BFF-only; browser roles receive no access.
--
-- This migration is additive. It deliberately keeps raw chat content in the
-- conversation/message records rather than in `ai_runs`, whose contract is
-- audit metadata and fingerprints only.

-- `skill_profiles` is the existing private overview. A chat-derived estimate
-- is distinguishable from a Brief or reviewed evidence estimate, and remains
-- unverified unless a later proof workflow changes it.
ALTER TYPE public.skill_estimate_basis
  ADD VALUE IF NOT EXISTS 'chat_inferred';

CREATE TYPE public.build_conversation_status AS ENUM (
  'active',
  'archived'
);

CREATE TYPE public.build_message_role AS ENUM (
  'user',
  'assistant'
);

-- One ongoing, private companion thread per Build. A later milestone can add
-- explicitly named threads without weakening this owner/build boundary.
CREATE TABLE public.build_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.build_conversation_status NOT NULL DEFAULT 'active',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT build_conversations_build_owner
    FOREIGN KEY (build_id, user_id)
    REFERENCES public.builds(id, user_id) ON DELETE CASCADE,
  CONSTRAINT build_conversations_build_owner_unique UNIQUE (build_id, user_id),
  CONSTRAINT build_conversations_id_owner_build_unique UNIQUE (id, user_id, build_id)
);

-- Message content is intentionally private, durable working context. It is
-- never copied into `ai_runs` metadata. `in_reply_to_message_id` gives an
-- exact response provenance link and supports safe idempotent retries.
CREATE TABLE public.build_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.build_message_role NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  in_reply_to_message_id UUID,
  ai_run_id UUID,
  client_idempotency_key UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT build_messages_conversation_owner
    FOREIGN KEY (conversation_id, user_id, build_id)
    REFERENCES public.build_conversations(id, user_id, build_id) ON DELETE CASCADE,
  CONSTRAINT build_messages_reply_owner
    FOREIGN KEY (in_reply_to_message_id, user_id, build_id, conversation_id)
    REFERENCES public.build_messages(id, user_id, build_id, conversation_id) ON DELETE CASCADE,
  CONSTRAINT build_messages_ai_run_owner
    FOREIGN KEY (ai_run_id, user_id, build_id)
    REFERENCES public.ai_runs(id, user_id, build_id) ON DELETE SET NULL (ai_run_id),
  CONSTRAINT build_messages_content_length
    CHECK (char_length(content) BETWEEN 1 AND 16000),
  CONSTRAINT build_messages_content_hash_format
    CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT build_messages_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT build_messages_id_owner_build_conversation_unique
    UNIQUE (id, user_id, build_id, conversation_id)
);

-- A skill inference is an append-only, private observation from exactly one
-- user-authored message. The fixed proof status and absence of public fields
-- make it impossible for this record itself to claim verification.
CREATE TABLE public.chat_skill_inferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  source_message_id UUID NOT NULL,
  source_message_content_hash TEXT NOT NULL,
  capability_id UUID NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  context_practice_id UUID NOT NULL,
  inferred_level public.skill_level NOT NULL,
  previous_level public.skill_level NOT NULL,
  applied_level public.skill_level NOT NULL,
  level_raised BOOLEAN NOT NULL DEFAULT FALSE,
  proof_status public.skill_proof_status NOT NULL DEFAULT 'unverified_estimate',
  rationale TEXT NOT NULL,
  signal_dimensions public.evidence_dimension[] NOT NULL DEFAULT '{}',
  inference_version TEXT NOT NULL DEFAULT 'build-companion-v1',
  generated_by_ai_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_skill_inferences_message_owner
    FOREIGN KEY (source_message_id, user_id, build_id, conversation_id)
    REFERENCES public.build_messages(id, user_id, build_id, conversation_id) ON DELETE CASCADE,
  CONSTRAINT chat_skill_inferences_context_practice_capability
    FOREIGN KEY (context_practice_id, capability_id)
    REFERENCES public.context_practices(id, capability_id) ON DELETE RESTRICT,
  CONSTRAINT chat_skill_inferences_ai_run_owner
    FOREIGN KEY (generated_by_ai_run_id, user_id, build_id)
    REFERENCES public.ai_runs(id, user_id, build_id) ON DELETE SET NULL (generated_by_ai_run_id),
  CONSTRAINT chat_skill_inferences_source_hash_format
    CHECK (source_message_content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT chat_skill_inferences_inferred_level_assessed
    CHECK (inferred_level <> 'not_yet_assessed'),
  CONSTRAINT chat_skill_inferences_private_only
    CHECK (proof_status = 'unverified_estimate'),
  CONSTRAINT chat_skill_inferences_rationale_length
    CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 1000),
  CONSTRAINT chat_skill_inferences_id_owner_unique UNIQUE (id, user_id),
  CONSTRAINT chat_skill_inferences_one_per_source_message UNIQUE (source_message_id)
);

-- The application only creates user messages without a reply pointer and one
-- assistant message that points to that exact user message. Enforce this at
-- the database boundary so provenance cannot be fabricated by a later route.
CREATE OR REPLACE FUNCTION public.validate_build_message_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  referenced_role public.build_message_role;
BEGIN
  IF NEW.role = 'user' AND NEW.in_reply_to_message_id IS NOT NULL THEN
    RAISE EXCEPTION 'User messages cannot reply to another message';
  END IF;

  IF NEW.role = 'assistant' AND NEW.in_reply_to_message_id IS NULL THEN
    RAISE EXCEPTION 'Assistant messages must reply to a user message';
  END IF;

  IF NEW.in_reply_to_message_id IS NOT NULL THEN
    SELECT message.role
    INTO referenced_role
    FROM public.build_messages AS message
    WHERE message.id = NEW.in_reply_to_message_id
      AND message.user_id = NEW.user_id
      AND message.build_id = NEW.build_id
      AND message.conversation_id = NEW.conversation_id;

    IF NOT FOUND OR referenced_role <> 'user' THEN
      RAISE EXCEPTION 'Assistant messages may only reply to a user message in the same Build conversation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER build_messages_validate_reply
  BEFORE INSERT OR UPDATE OF role, in_reply_to_message_id, user_id, build_id, conversation_id
  ON public.build_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_build_message_reply();

CREATE TRIGGER build_conversations_set_updated_at
  BEFORE UPDATE ON public.build_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX build_conversations_user_build_activity_idx
  ON public.build_conversations (user_id, build_id, last_message_at DESC NULLS LAST);

CREATE INDEX build_messages_user_build_conversation_created_idx
  ON public.build_messages (user_id, build_id, conversation_id, created_at ASC, id ASC);

CREATE UNIQUE INDEX build_messages_user_client_idempotency_key_unique
  ON public.build_messages (user_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX build_messages_one_assistant_reply_per_user_message
  ON public.build_messages (in_reply_to_message_id)
  WHERE role = 'assistant' AND in_reply_to_message_id IS NOT NULL;

CREATE INDEX chat_skill_inferences_user_capability_created_idx
  ON public.chat_skill_inferences (user_id, capability_id, created_at DESC);

CREATE INDEX chat_skill_inferences_user_build_message_idx
  ON public.chat_skill_inferences (user_id, build_id, source_message_id);

ALTER TABLE public.build_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_skill_inferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.build_conversations,
  public.build_messages,
  public.chat_skill_inferences
FROM PUBLIC, anon, authenticated;

GRANT USAGE ON TYPE
  public.build_conversation_status,
  public.build_message_role
TO service_role;

GRANT ALL PRIVILEGES ON TABLE
  public.build_conversations,
  public.build_messages,
  public.chat_skill_inferences
TO service_role;
