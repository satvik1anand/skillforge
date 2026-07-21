# SkillForge — Agent Instructions

## What Is SkillForge?

SkillForge is an AI-powered skills portfolio platform. Users work with a context-aware AI workspace to explore topics, build projects, and grow professionally — while the system silently extracts, tracks, and verifies their skills from the quality of their interactions.

**The core insight:** The questions you ask reveal what you know. An Advanced developer asks fundamentally different questions than a Beginner. SkillForge captures this signal without interrupting your flow.

**Vision:** Make the user feel like they're building something — a living skills portfolio — while doing their normal work: exploring topics, solving problems, learning new things. A "project" isn't just code — it can be a topic exploration, a passion pursuit, a career pivot.

---

## Product Positioning

- **Open-source tool** anyone with infra can self-host
- **Free demo** at skillforge.app (or similar) for people to experience
- **Hackathon track:** Education (OpenAI Build Week)
- **Not a chatbot.** A workspace that happens to be intelligent.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router, TypeScript, Tailwind + shadcn/ui) |
| Backend | Express.js (TypeScript, controller-service-model architecture) |
| Database | Supabase Postgres + pgvector (semantic cache) |
| Auth | Supabase Auth (client-side SDK for signup/login, JWT verified by BE) |
| Storage | Supabase Storage (markdown files) |
| AI (Chat) | OpenAI GPT-5.6 Luna ($1/$6 per M tokens) |
| AI (Embeddings) | text-embedding-3-small ($0.02/M tokens) |
| Deployment | Vercel (FE) + Railway (BE) + Supabase (DB) |
| State | SWR for client-side data fetching |

### Architecture Pattern
```
Next.js (UI + Auth) → Express BE (business logic) → Supabase (data) + OpenAI (AI)
```

The frontend uses `@supabase/ssr` ONLY for authentication (signup, login, session/JWT management). All other data operations go through the Express backend API with the JWT in the Authorization header.

---

## Design Language

Inspired by **Notion** (calm workspace, typography-first) × **Emergent** (AI-as-primary-interface, direct intent-to-action).

**Principles:**
- Dark, muted, workspace-first — not a chat skin, a professional tool
- Content hierarchy through typography and spacing — not heavy visual decoration
- The AI is invisible — it doesn't feel like "chatting with a bot," it feels like working in an intelligent workspace
- Skills surface organically — they appear in context, never interrupting flow
- Calm confidence — no exclamation marks, no gamification, no "streaks"

**Visual direction:**
- Background: near-black (#0a0a0b) with subtle warm grays for surfaces
- Text: high-contrast white (#fafafa) for headings, muted (#a1a1aa) for secondary
- Accent: single subtle brand color (for interactive elements only)
- Borders: barely visible, 1px, rgba white at 5-8%
- Radius: 8px cards, 6px inputs
- Font: Inter or system default, clean and readable
- Spacing: generous, breathing room between elements

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Vercel (Next.js)                       │
│                                                          │
│  Landing Page ─── Auth ─── Workspace App                 │
│       │                        │                         │
│       │           ┌────────────┼────────────┐            │
│       │           │            │            │            │
│       │        Sidebar      Main Panel   Context Panel   │
│       │       (Projects)    (Chat/View)  (Skills)        │
└───────┼───────────┼────────────┼────────────┼────────────┘
        │           │            │            │
        │           └────────────┼────────────┘
        │                        │
        ▼                        ▼
┌──────────────────────────────────────────────────────────┐
│                      Supabase                             │
│  Auth │ Postgres+pgvector │ Storage │ Edge Functions      │
│                                         │                │
│                                         ▼                │
│                                   OpenAI GPT-5.6 Luna    │
└──────────────────────────────────────────────────────────┘
```

---

## Folder Structure (Monorepo)

```
skillforge/
├── client/                            # Next.js Frontend
│   ├── src/
│   │   ├── app/                       # Next.js App Router
│   │   │   ├── (marketing)/           # Landing page (unauthenticated)
│   │   │   │   ├── page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── (auth)/                # Auth routes
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── signup/page.tsx
│   │   │   │   └── onboarding/page.tsx
│   │   │   ├── (workspace)/           # Authenticated workspace
│   │   │   │   ├── layout.tsx         # Sidebar + panels layout
│   │   │   │   ├── page.tsx
│   │   │   │   ├── project/
│   │   │   │   │   ├── new/page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx
│   │   │   │   │       ├── chat/[chatId]/page.tsx
│   │   │   │   │       └── skillup/page.tsx
│   │   │   │   └── portfolio/page.tsx
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn/ui components
│   │   │   ├── workspace/            # sidebar, project-list, user-menu
│   │   │   ├── chat/                 # chat-panel, message-bubble, chat-input
│   │   │   ├── skills/              # skills-panel, skill-badge, verification-dialog
│   │   │   ├── portfolio/           # portfolio-hero, skills-grid, growth-timeline
│   │   │   ├── onboarding/          # onboarding-flow
│   │   │   └── landing/             # hero, features, footer
│   │   ├── lib/
│   │   │   ├── supabase/            # Auth ONLY (client.ts, server.ts, middleware.ts)
│   │   │   ├── api.ts               # Fetch wrapper (attaches JWT to all BE calls)
│   │   │   └── hooks/               # SWR hooks (useProjects, useChats, useSkills)
│   │   └── styles/
│   │       └── globals.css
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── server/                            # Express.js Backend
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── onboarding.controller.ts
│   │   │   ├── project.controller.ts
│   │   │   ├── chat.controller.ts
│   │   │   ├── skill.controller.ts
│   │   │   └── portfolio.controller.ts
│   │   ├── services/
│   │   │   ├── ai.service.ts          # GPT-5.6 calls, prompt building
│   │   │   ├── context.service.ts     # Smart context assembly + compression
│   │   │   ├── cache.service.ts       # Semantic cache (pgvector)
│   │   │   ├── skill-extractor.service.ts
│   │   │   ├── project.service.ts
│   │   │   ├── chat.service.ts
│   │   │   └── skill.service.ts
│   │   ├── models/
│   │   │   ├── user.model.ts
│   │   │   ├── project.model.ts
│   │   │   ├── chat.model.ts
│   │   │   ├── message.model.ts
│   │   │   ├── skill.model.ts
│   │   │   ├── skill-validation.model.ts
│   │   │   └── cache.model.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts     # JWT verification
│   │   │   ├── validate.middleware.ts # Zod input validation
│   │   │   ├── rate-limiter.middleware.ts
│   │   │   └── error-handler.middleware.ts
│   │   ├── routes/
│   │   │   └── index.ts
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   ├── supabase.ts
│   │   │   └── openai.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── index.ts                   # Express app entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── supabase/
│   └── schema.sql                     # Full database schema (run in SQL Editor)
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── AI_INTEGRATION.md
│   └── TASKS.md
├── package.json                       # Root: scripts to run both
├── .env.example
├── .gitignore
├── AGENTS.md                          # This file (Codex reads this)
└── README.md
```

---

## Key Behaviors

### Onboarding (post-signup)
After account creation, 3-4 quick questions — like Emergent's starting flow:
1. "What do you do?" (occupation/role — freeform)
2. "What brings you to SkillForge?" (multi-select: track skills, build portfolio, explore topics, career growth)
3. "Any specific area you want to grow in?" (freeform, optional)

Stored in `user_profiles.onboarding_data` as JSON. No persona features yet — demographic data collection for future tailoring.

### Project Definition (broad)
A "project" in SkillForge is anything you're working on or exploring:
- A code project you're building
- A topic you're self-studying (e.g., "Learning distributed systems")
- A career exploration (e.g., "Transitioning from backend to ML")
- A passion pursuit (e.g., "Building a synthesizer from scratch")

The UI hints at this breadth. Never uses the word "project" alone — uses "project or exploration."

### AI Interaction Model
- **Project creation:** AI asks ONE pointed question based on description, then establishes context
- **Ongoing chat:** AI helps with queries, optimized for teaching. Skill extraction happens in background.
- **No follow-up spam:** AI never says "tell me more" — it infers from question quality
- **Context updates silently:** Each interaction updates the project's context summary without user intervention
- **Focused chats encouraged:** UX nudges users toward topic-specific chats for better skill capture

### Skill Extraction Philosophy
- Skills are extracted from the QUALITY of questions, not just mentions
- "How do I use useState?" → React: Beginner signal
- "Should I colocate state or lift it given my component tree depth?" → React: Intermediate signal
- The AI never interrupts to say "I detected a skill!" — it just updates in the background
- User sees skills grow over time in their portfolio

---

## Environment Variables

### Client (client/.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Server (server/.env)
```
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_JWT_SECRET=xxx
OPENAI_API_KEY=sk-xxx
```

**Critical:** OpenAI key and Supabase service role key are NEVER in the client. The client only has the public Supabase anon key (for auth) and the BE API URL.

---

## Build Order

Follow `docs/TASKS.md`. Summary:
1. Next.js scaffold + Supabase + Auth
2. Landing page
3. Onboarding flow
4. Workspace layout (sidebar + panels)
5. Project creation
6. Chat system (multi-chat per project)
7. AI integration (GPT-5.6 Luna + context system)
8. Skill extraction + display
9. Skill verification
10. Portfolio view
11. Polish + deploy

---

## Reference Documents

- `docs/PRODUCT_SPEC.md` — Complete product requirements and UX flows
- `docs/ARCHITECTURE.md` — Technical architecture, smart context system, caching
- `docs/AI_INTEGRATION.md` — System prompts, schemas, context compression
- `docs/TASKS.md` — Sequential build tasks
- `supabase/schema.sql` — Database schema (run in Supabase SQL Editor)
