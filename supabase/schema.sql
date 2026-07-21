-- ============================================================================
-- LEGACY / DO NOT RUN
-- ============================================================================
-- This was the original one-shot schema draft. It contains the superseded
-- aggregate skill model and permissive access design, and must not be applied
-- beside the migration-first foundation.
--
-- Use supabase/migrations/202607190001_initial_foundation.sql through the
-- Supabase migration workflow instead. See supabase/README.md for the safe
-- setup path. This file is retained only for historical comparison.
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- 1. USER PROFILES
-- ============================================================================

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  tagline TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  onboarding_data JSONB DEFAULT NULL,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. PROJECTS
-- ============================================================================

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  markdown_context TEXT DEFAULT '',
  markdown_file_path TEXT DEFAULT '',
  context_summary TEXT DEFAULT '',
  probing_state TEXT NOT NULL DEFAULT 'probing' CHECK (probing_state IN ('probing', 'complete')),
  probing_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_projects_created_at ON public.projects(created_at DESC);

-- ============================================================================
-- 3. CHATS (multiple per project)
-- ============================================================================

CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chats_project_id ON public.chats(project_id);
CREATE INDEX idx_chats_user_id ON public.chats(user_id);
CREATE INDEX idx_chats_last_active ON public.chats(last_active DESC);

-- ============================================================================
-- 4. MESSAGES
-- ============================================================================

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  is_insight BOOLEAN NOT NULL DEFAULT FALSE,
  related_skills TEXT[] DEFAULT '{}',
  is_compressed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX idx_messages_created_at ON public.messages(chat_id, created_at ASC);
CREATE INDEX idx_messages_uncompressed ON public.messages(chat_id, is_compressed) WHERE is_compressed = FALSE;

-- ============================================================================
-- 5. SKILLS
-- ============================================================================

CREATE TYPE skill_level AS ENUM ('Beginner', 'Intermediate', 'Advanced');

CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level skill_level NOT NULL DEFAULT 'Beginner',
  progress REAL NOT NULL DEFAULT 0.1 CHECK (progress >= 0.0 AND progress <= 1.0),
  category TEXT DEFAULT '',
  source_projects UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_skills_user_id ON public.skills(user_id);
CREATE INDEX idx_skills_category ON public.skills(user_id, category);

-- ============================================================================
-- 6. SKILL VALIDATIONS
-- ============================================================================

CREATE TYPE validation_type AS ENUM ('certification', 'live_project', 'open_source', 'ai_assessed');

CREATE TABLE public.skill_validations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type validation_type NOT NULL,
  label TEXT NOT NULL,
  url TEXT DEFAULT '',
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skill_validations_skill_id ON public.skill_validations(skill_id);
CREATE INDEX idx_skill_validations_user_id ON public.skill_validations(user_id);

-- ============================================================================
-- 7. SEMANTIC CACHE (pgvector)
-- ============================================================================

CREATE TABLE public.semantic_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_embedding vector(1536) NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_expires TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX idx_semantic_cache_project_id ON public.semantic_cache(project_id);
CREATE INDEX idx_semantic_cache_ttl ON public.semantic_cache(ttl_expires);

-- HNSW index for fast vector similarity search
CREATE INDEX idx_semantic_cache_embedding ON public.semantic_cache
  USING hnsw (question_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 8. VECTOR SIMILARITY SEARCH FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION match_cached_responses(
  query_embedding vector(1536),
  p_project_id uuid,
  similarity_threshold float DEFAULT 0.92,
  match_count int DEFAULT 1
)
RETURNS TABLE (
  id uuid,
  question_text text,
  response_json jsonb,
  ttl_expires timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.question_text,
    sc.response_json,
    sc.ttl_expires,
    (1 - (sc.question_embedding <=> query_embedding))::float as similarity
  FROM public.semantic_cache sc
  WHERE sc.project_id = p_project_id
    AND (1 - (sc.question_embedding <=> query_embedding)) > similarity_threshold
    AND sc.ttl_expires > NOW()
  ORDER BY sc.question_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 9. STORAGE BUCKET (for markdown context files)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (users upload to their own folder)
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-files' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 10. HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Update chat last_active when a message is inserted
CREATE OR REPLACE FUNCTION public.update_chat_last_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chats SET last_active = NOW() WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_chat_last_active();

-- Update skill last_updated
CREATE TRIGGER update_skills_last_updated
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Cleanup expired cache entries (run periodically via cron or manual)
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM public.semantic_cache WHERE ttl_expires < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================================
-- Note: Since all DB access goes through the Express BE using the service role key,
-- RLS is a defense-in-depth measure. The BE enforces access control in the service layer.
-- But we enable RLS anyway as a safety net.

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_cache ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so these policies are only needed if
-- you ever add direct client access in the future.
CREATE POLICY "service_role_all" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.chats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.skills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.skill_validations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.semantic_cache FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- DONE!
-- 
-- Next steps:
-- 1. Set up Express backend (server/)
-- 2. Configure env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
-- 3. Deploy to Railway/Render
-- ============================================================================
