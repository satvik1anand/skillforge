# SkillForge — Historical Build Tasks

> **Status:** retained as the original implementation outline. The active sequence is now [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md), and product decisions in [PRE_DEVELOPMENT_REFINEMENT.md](./PRE_DEVELOPMENT_REFINEMENT.md) take precedence where they differ. In particular, do not implement the old aggregate-only skill, permissive data access, or simple verification design from this file.

> **Database warning:** never run `supabase/schema.sql` from this historical plan. For a fresh project, apply only the ordered migrations in `supabase/migrations/`; see [SUPABASE_HOSTED_SETUP.md](./SUPABASE_HOSTED_SETUP.md) and [../supabase/README.md](../supabase/README.md).

## Project Structure

This is a monorepo with two packages:
- `client/` — Next.js frontend (UI + Supabase Auth only)
- `server/` — Express.js backend (all business logic + AI)

---

## Task 1: Monorepo Scaffold

**What:** Set up the monorepo with both client and server packages, install all dependencies.

**Steps:**
1. Create root `package.json` (workspaces config or just scripts for both)
2. Initialize `client/` with `npx create-next-app@latest` (App Router, TypeScript, Tailwind, src/ directory)
3. Initialize `server/` with `npm init`, install Express, TypeScript, ts-node-dev
4. Install shadcn/ui in client: `npx shadcn@latest init`
5. Install all dependencies per the package.json specs below
6. Configure TypeScript in both (`tsconfig.json`)
7. Set up basic scripts: `npm run dev:client`, `npm run dev:server`
8. Create `.env.example` files for both client and server
9. Verify: both `npm run dev:client` and `npm run dev:server` start without errors

**Client dependencies:** next, react, @supabase/ssr, @supabase/supabase-js, tailwindcss, class-variance-authority, clsx, lucide-react, tailwind-merge, swr
**Server dependencies:** express, @supabase/supabase-js, openai, zod, cors, helmet, express-rate-limit, dotenv, jsonwebtoken, uuid
**Server dev deps:** typescript, ts-node-dev, @types/express, @types/cors, @types/jsonwebtoken

---

## Task 2: Server Foundation (Express + Middleware)

**What:** Set up the Express server with all middleware, folder structure, and config.

**Steps:**
1. Create `server/src/index.ts` — Express app with CORS, helmet, JSON parsing, rate limiter, error handler
2. Create `server/src/config/env.ts` — validate required env vars with Zod on startup
3. Create `server/src/config/supabase.ts` — Supabase admin client (service role key)
4. Create `server/src/config/openai.ts` — OpenAI client initialization
5. Create `server/src/middleware/auth.middleware.ts` — verify Supabase JWT, decode user_id, attach to req
6. Create `server/src/middleware/validate.middleware.ts` — generic Zod validation middleware
7. Create `server/src/middleware/error-handler.middleware.ts` — structured JSON error responses
8. Create `server/src/routes/index.ts` — route registration (placeholder routes)
9. Create `server/src/types/index.ts` — Request extension types (req.user), shared types
10. Verify: server starts, health check endpoint returns 200, auth middleware rejects invalid tokens

---

## Task 3: Database Schema + Models

**What:** Run the Supabase schema and create all model files in the server.

**Steps:**
1. Run `supabase/schema.sql` in Supabase SQL Editor
2. Create `server/src/models/user.model.ts` — getUserProfile, updateProfile, saveOnboarding
3. Create `server/src/models/project.model.ts` — CRUD, updateContextSummary, updateProbingState
4. Create `server/src/models/chat.model.ts` — create, list by project, get by id
5. Create `server/src/models/message.model.ts` — create, getRecent, markCompressed
6. Create `server/src/models/skill.model.ts` — upsert, list by user, update level/progress
7. Create `server/src/models/skill-validation.model.ts` — create, delete, list by skill
8. Create `server/src/models/cache.model.ts` — insert embedding, match similar, cleanup expired
9. Verify: can connect to Supabase, basic CRUD operations work with test data

---

## Task 4: Auth Flow (Client + Server)

**What:** Implement signup/login on the frontend with Supabase Auth, configure BE to verify tokens.

**Steps:**
1. Client: Create `src/lib/supabase/client.ts` — browser Supabase client (anon key)
2. Client: Create `src/lib/supabase/server.ts` — server-side Supabase client for Next.js middleware
3. Client: Create `src/lib/supabase/middleware.ts` — Next.js middleware to refresh sessions
4. Client: Create `src/app/(auth)/login/page.tsx` — email + password form, calls supabase.auth.signInWithPassword
5. Client: Create `src/app/(auth)/signup/page.tsx` — email + password + display name
6. Client: Create `src/app/(auth)/layout.tsx` — centered card layout, redirect if already logged in
7. Client: Create API helper `src/lib/api.ts` — fetch wrapper that attaches JWT to all BE requests
8. Server: Verify auth middleware correctly decodes Supabase JWTs
9. Server: Create `server/src/controllers/auth.controller.ts` — GET /api/auth/me returns user profile
10. Verify: User can sign up, log in, see their profile via BE, gets redirected if not authenticated

---

## Task 5: Onboarding Flow

**What:** Post-signup conversational onboarding (3 questions) → stored in user profile.

**Steps:**
1. Client: Create `src/app/(auth)/onboarding/page.tsx` — single-page flow, questions appear one at a time
   - Q1: "What do you do?" (freeform input)
   - Q2: "What brings you here?" (multi-select chips)
   - Q3: "Anything specific you want to grow in?" (freeform, skippable)
2. Client: Smooth transitions between questions (fade/slide)
3. Server: Create `server/src/controllers/onboarding.controller.ts` — POST /api/onboarding
4. Server: Create `server/src/services/onboarding.service.ts` — saves to user_profiles.onboarding_data
5. Client: After completion → redirect to workspace (or project creation if no projects)
6. Verify: New user sees onboarding, answers saved to DB, existing users skip to workspace

---

## Task 6: Landing Page

**What:** Marketing landing page (Emergent-inspired) at the root URL for unauthenticated users.

**Steps:**
1. Client: Create `src/app/(marketing)/page.tsx` — the landing page
2. Client: Create `src/app/(marketing)/layout.tsx` — minimal layout (no sidebar)
3. Client: Create components:
   - `src/components/landing/hero.tsx` — headline, subline, CTA input or button
   - `src/components/landing/how-it-works.tsx` — 3-step visual
   - `src/components/landing/features.tsx` — 3-4 feature cards
   - `src/components/landing/footer.tsx` — links, open-source badge
4. Dark theme, minimal, content-forward. Single scrollable page.
5. CTA routes to /signup
6. Verify: Unauthenticated users see landing, authenticated users redirect to workspace

---

## Task 7: Workspace Layout Shell

**What:** The main authenticated layout with sidebar + main panel + context panel.

**Steps:**
1. Client: Create `src/app/(workspace)/layout.tsx` — the three-panel shell
2. Client: Create `src/components/workspace/sidebar.tsx`
   - App logo/name
   - Project list (fetched from BE)
   - "+ New project or exploration" button
   - Portfolio link
   - Settings link (placeholder)
   - User avatar + name at bottom
3. Client: Create `src/components/workspace/project-list.tsx` — lists projects in sidebar
4. Client: Create `src/components/workspace/user-menu.tsx` — avatar + dropdown (logout)
5. Server: Implement `GET /api/projects` — returns user's projects with skill counts
6. Client: Default page shows empty state ("Start your first project or exploration")
7. Responsive: sidebar collapses to icon rail on tablet, drawer on mobile
8. Verify: Logged-in user sees workspace shell, projects listed (empty initially)

---

## Task 8: Project Creation

**What:** "New project" form → saves to DB → triggers AI probing → redirects to chat.

**Steps:**
1. Client: Create `src/app/(workspace)/project/new/page.tsx`
   - Form: name, description (textarea), markdown file upload (optional)
   - Submit button
2. Server: Create `server/src/controllers/project.controller.ts` — POST /api/projects
3. Server: Create `server/src/services/project.service.ts`
   - Save project to DB
   - Upload markdown to Supabase Storage (if provided)
   - Call AI service for first probing message
   - Create first chat + insert AI message
   - Return project + chat + initial message
4. Client: After creation → navigate to `/project/[id]/chat/[chatId]`
5. Verify: User creates project, sees first AI probing question, project appears in sidebar

---

## Task 9: Chat System (Multi-Chat + Messages)

**What:** Full chat interface — message list, input, multiple chats per project.

**Steps:**
1. Server: Create `server/src/controllers/chat.controller.ts`
   - GET /api/projects/:id/chats
   - POST /api/projects/:id/chats
   - GET /api/chats/:id/messages
   - POST /api/chats/:id/messages
2. Server: Create `server/src/services/chat.service.ts`
   - sendMessage: save user msg → check probing state → build context → call AI → save response → update skills → update context
3. Client: Create `src/app/(workspace)/project/[id]/chat/[chatId]/page.tsx`
4. Client: Create components:
   - `src/components/chat/chat-panel.tsx` — message list + input
   - `src/components/chat/message-bubble.tsx` — user vs assistant styling
   - `src/components/chat/chat-input.tsx` — textarea + send button
   - `src/components/chat/chat-list.tsx` — sidebar list of chats for this project
5. Client: "+ New chat" creates a new thread
6. Client: Auto-scroll to bottom on new messages, loading indicator while AI responds
7. Verify: User can create chats, send messages, see AI responses, switch between chats

---

## Task 10: AI Integration (GPT-5.6 Luna)

**What:** Wire up the actual AI service with smart context, structured output, and adaptive probing.

**Steps:**
1. Server: Create `server/src/services/ai.service.ts`
   - callGPT function (handles all OpenAI calls with structured output)
   - buildChatContext (assembles: system prompt + context summary + skills + last 10 messages)
   - handleProbing (adaptive 1-3 question logic)
   - handleCompanionChat (normal companion mode)
   - analyzeRichness (determine if description is rich/moderate/thin)
2. Server: Create `server/src/services/context.service.ts`
   - buildContext: assemble minimal context for a GPT call
   - appendToContextSummary: update project's living context
   - compressConversation: summarize old messages into context
3. Server: Create `server/src/services/skill-extractor.service.ts`
   - parseSkillUpdates: take AI response → upsert skills in DB
   - mergeSkills: handle new vs updated skills without duplicates
4. Wire into chat.service.ts: each message flows through the full pipeline
5. Verify: Send a message → get structured AI response → skills may appear → context updates

---

## Task 11: Semantic Cache

**What:** Implement pgvector-based semantic caching to reduce AI calls.

**Steps:**
1. Server: Create `server/src/services/cache.service.ts`
   - checkCache: embed question → search pgvector → return cached if similar
   - cacheResponse: embed question → store in semantic_cache table
   - cleanupExpired: remove entries past TTL
2. Wire into chat flow: check cache BEFORE calling GPT, cache AFTER getting response
3. Test: same question asked twice → second time returns instantly from cache
4. Verify: cache hits logged, response time drops for repeated similar questions

---

## Task 12: Skills Panel + Display

**What:** Right-side panel showing skills for the active project, with badges.

**Steps:**
1. Server: Implement `GET /api/skills` — returns user's skills with validations
2. Client: Create `src/components/skills/skills-panel.tsx` — right panel in workspace
3. Client: Create `src/components/skills/skill-badge.tsx` — skill name, level, progress bar, verification icon
4. Client: Skills panel updates reactively (refetch after each AI response)
5. Client: Panel collapses gracefully on smaller screens
6. Verify: Skills appear as AI extracts them, levels/progress update visually

---

## Task 13: Skill Verification

**What:** Users can add verifications (certifications, repos, live URLs) to skills.

**Steps:**
1. Server: Implement `POST /api/skills/:id/verify` — add verification
2. Server: Implement `DELETE /api/skills/:id/verify/:vid` — remove verification
3. Client: Create `src/components/skills/verification-dialog.tsx`
   - Type selector: Certification | Live Project | Open Source Repo
   - Label input, URL input
   - Save button
4. Client: Trigger from skill badge (click/menu → "Add verification")
5. Client: Verification badges appear on skill after adding
6. Verify: Add a certification → badge appears → persists on refresh

---

## Task 14: Portfolio View

**What:** The user's skills portfolio — aggregated view across all projects.

**Steps:**
1. Server: Implement `GET /api/portfolio` — aggregated data (skills by category, timeline, project contributions)
2. Client: Create `src/app/(workspace)/portfolio/page.tsx`
3. Client: Create components:
   - `src/components/portfolio/portfolio-hero.tsx` — name, tagline, stats
   - `src/components/portfolio/skills-grid.tsx` — grouped by category with verification badges
   - `src/components/portfolio/growth-timeline.tsx` — chronological skill events
4. Verify: Portfolio shows all skills from all projects, correctly categorized and verified

---

## Task 15: Skill-Up Tab

**What:** AI-generated learning recommendations per skill, in project context.

**Steps:**
1. Server: Implement `GET /api/projects/:id/skillup` — calls AI for recommendations
2. Client: Create `src/app/(workspace)/project/[id]/skillup/page.tsx`
3. Client: Tab/toggle in project view to switch between Chat and Skill Up
4. Client: Cards per skill with recommendations (articles, exercises, certifications)
5. Cache recommendations in BE (don't regenerate on every tab switch)
6. Verify: Switch to Skill Up → see personalized recommendations

---

## Task 16: Polish + Deploy

**What:** Make it production-ready, deploy both services, create test data.

**Steps:**
1. Client: Loading states (skeleton loaders for project list, chat, skills)
2. Client: Empty states (no projects, no skills, no chats)
3. Client: Error toasts for transient errors
4. Client: Responsive behavior (tablet collapse, basic mobile support)
5. Server: Ensure all error cases handled gracefully
6. Deploy client to Vercel (connect GitHub repo)
7. Deploy server to Railway (Dockerfile or nixpacks)
8. Configure environment variables on both platforms
9. Create test user account for judges
10. Seed sample data (1-2 projects with chat history + extracted skills)
11. Write README.md:
    - Live demo URL + test credentials
    - Setup instructions (local dev)
    - How GPT-5.6 is used
    - How Codex built it
    - Architecture overview
12. Verify: Full flow works end-to-end on deployed URLs

---

## Task Dependencies

```
Task 1 (Scaffold)
  ├→ Task 2 (Server Foundation)
  │    └→ Task 3 (DB + Models)
  │         └→ Task 4 (Auth)
  │              ├→ Task 5 (Onboarding)
  │              └→ Task 7 (Workspace Shell)
  │                   ├→ Task 8 (Project Creation)
  │                   │    └→ Task 9 (Chat System)
  │                   │         └→ Task 10 (AI Integration)
  │                   │              ├→ Task 11 (Semantic Cache)
  │                   │              ├→ Task 12 (Skills Panel)
  │                   │              │    └→ Task 13 (Verification)
  │                   │              └→ Task 15 (Skill-Up)
  │                   └→ Task 14 (Portfolio)
  └→ Task 6 (Landing Page) — can be done in parallel

Task 16 (Polish + Deploy) — after all others
```
