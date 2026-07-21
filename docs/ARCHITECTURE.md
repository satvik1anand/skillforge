# SkillForge — Technical Architecture

> **Status:** historical architecture draft. It predates the migration-first database model and the current browser-session plus Express JWKS verifier. For implementation, follow [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md), [SUPABASE_HOSTED_SETUP.md](./SUPABASE_HOSTED_SETUP.md), the current source code, and `supabase/migrations/`. In particular, do not configure `SUPABASE_JWT_SECRET`, do not use this document's cookie/middleware claim as an implementation instruction, and do not use it to choose application-table RLS policies.

## Overview

SkillForge uses a three-tier architecture: a Next.js frontend (UI + auth only), an Express.js backend (all business logic + AI), and Supabase (DB + storage + auth provider).

The frontend never touches the database directly. Supabase Auth runs client-side for signup/login only. Everything else flows through the Express BE which validates JWTs, enforces business rules, and proxies AI calls.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js on Vercel)                   │
│                                                                 │
│  @supabase/ssr (auth ONLY: signup, login, session, JWT)         │
│                                                                 │
│  All data operations → Express BE API                           │
│  Passes JWT in Authorization: Bearer <token> header             │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS (JSON REST)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│               BACKEND (Express.js on Railway/Render)              │
│                                                                 │
│  Middleware:                                                    │
│   ├── JWT verification (Supabase public key)                    │
│   ├── Rate limiting (per-user, per-endpoint)                    │
│   ├── Input validation (Zod schemas)                            │
│   └── Error handling (structured JSON errors)                   │
│                                                                 │
│  Controllers → Services → Models                                │
│                                                                 │
│  Services:                                                      │
│   ├── ai.service (GPT-5.6 Luna calls, prompt assembly)          │
│   ├── context.service (smart context building + compression)    │
│   ├── cache.service (pgvector semantic cache)                   │
│   ├── skill-extractor.service (parse AI → skill updates)        │
│   ├── project.service (CRUD + context summary updates)          │
│   ├── chat.service (messages + AI orchestration)                │
│   └── skill.service (CRUD + merge + verification)               │
└────────────────────┬────────────────────┬───────────────────────┘
                     │                    │
                     ▼                    ▼
┌────────────────────────────┐  ┌─────────────────────────────────┐
│        Supabase             │  │         OpenAI API               │
│                            │  │                                 │
│  Auth (identity provider)  │  │  GPT-5.6 Luna (chat/extraction) │
│  Postgres + pgvector       │  │  text-embedding-3-small (cache)  │
│  Storage (markdown files)  │  │                                 │
└────────────────────────────┘  └─────────────────────────────────┘
```

---

## Authentication Flow

```
1. User opens app → Next.js loads
2. User clicks "Sign Up" → @supabase/ssr creates account via Supabase Auth
3. Supabase returns a JWT (access token + refresh token)
4. Next.js stores session (httpOnly cookie via @supabase/ssr middleware)
5. On every API call to Express BE:
   - Next.js reads JWT from session
   - Sends: Authorization: Bearer <jwt>
6. Express BE middleware:
   - Extracts JWT from header
   - Verifies signature against Supabase JWT secret (SUPABASE_JWT_SECRET)
   - Decodes user ID from token payload
   - Attaches user to request object
   - Rejects if invalid/expired
7. Service layer uses user_id for all DB queries (scoped data access)
```

**Why this pattern:**
- Supabase Auth client SDK handles all the hard parts (OAuth, magic links, token refresh)
- The anon key is safe to expose (it's designed for client-side use)
- Express BE never needs to handle password hashing, session storage, or OAuth redirects
- JWT verification is stateless and fast (just cryptographic signature check)
- All data access is server-side only — no RLS dependency (we enforce access in service layer)

---

## Backend Architecture (Controller → Service → Model)

### Controllers
Handle HTTP routing, request parsing, and response formatting. No business logic.

```typescript
// Example: chat.controller.ts
router.post('/api/chats/:id/messages', auth, validate(sendMessageSchema), async (req, res, next) => {
  try {
    const result = await chatService.sendMessage({
      chatId: req.params.id,
      userId: req.user.id,
      content: req.body.content,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
```

### Services
Contain all business logic. Orchestrate between models, AI, cache, and external services.

```typescript
// Example: chat.service.ts
async sendMessage({ chatId, userId, content }) {
  // 1. Verify user owns this chat
  // 2. Save user message to DB
  // 3. Build smart context (project summary + last 10 messages + skills)
  // 4. Check semantic cache for similar question
  // 5. If cache miss → call GPT-5.6 Luna
  // 6. Parse structured response
  // 7. Save AI message to DB
  // 8. Update skills in background (if AI returned skill updates)
  // 9. Update project context summary in background
  // 10. Cache the Q&A pair as embedding
  // 11. Return AI response to controller
}
```

### Models
Define TypeScript interfaces and handle all Supabase DB queries. Thin data-access layer.

```typescript
// Example: message.model.ts
export async function createMessage(data: CreateMessageInput): Promise<Message> {
  const { data: message, error } = await supabase
    .from('messages')
    .insert(data)
    .select()
    .single();
  if (error) throw new DatabaseError(error.message);
  return message;
}

export async function getRecentMessages(chatId: string, limit = 10): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new DatabaseError(error.message);
  return data.reverse(); // chronological order
}
```

---

## Smart Context System

Instead of sending entire chat history to GPT on every call:

### 1. Project Context Summary (living document)
- Stored in `projects.context_summary` (TEXT column)
- Updated after every AI interaction as a side-effect
- Contains: what the user is building, key decisions made, technologies used, current focus
- ~200-400 tokens, replaces sending full markdown + all history

### 2. Conversation Window (last 10 messages)
- Only the most recent 10 messages from the current chat are sent
- Older messages were already "absorbed" into the context summary

### 3. Skills as Compact JSON
- Current skills pulled fresh from DB on each call
- Formatted as: `"React (Intermediate, 0.6), Node.js (Beginner, 0.3)"`
- ~50-100 tokens regardless of how many skills

### 4. Semantic Cache (pgvector)
- Each user question is embedded (text-embedding-3-small)
- Before calling GPT, search pgvector for similar past Q&A (cosine similarity > 0.92)
- If hit: return cached response immediately (free, <100ms)
- If miss: call GPT, then cache the new Q&A pair
- Cache entries expire after 7 days (TTL)
- Cache is per-project (similar question in different project context = miss)

### 5. Conversation Compression
- After every 10 messages in a chat, trigger a background compression:
  - Send the 10 messages to GPT with: "Summarize this conversation in 2-3 sentences, noting any skills demonstrated or technical decisions discussed"
  - Append summary to project context_summary
  - This keeps the context_summary growing intelligently without token bloat

### Token Budget Per Call

| Component | Tokens (est.) |
|-----------|---------------|
| System prompt | ~600 |
| Project context summary | ~300 |
| Current skills (compact) | ~100 |
| Last 10 messages | ~1500 |
| User's new message | ~200 |
| **Total input** | **~2700** |
| Output (response + skill updates) | ~500 |
| **Total per call** | **~3200** |

At GPT-5.6 Luna pricing ($1/$6 per M):
- Input cost: $0.0027 per call
- Output cost: $0.003 per call
- **Total: ~$0.006 per interaction (~$6 per 1000 chats)**

With semantic cache hitting 30-40% of requests: effective cost drops to ~$0.004/interaction.

---

## API Endpoints

### Auth (handled by Supabase client-side, but profile through BE)
```
GET    /api/auth/me              → Get user profile + onboarding status
```

### Onboarding
```
POST   /api/onboarding           → Save onboarding answers to user_profiles
```

### Projects
```
GET    /api/projects              → List user's projects (with skill counts)
POST   /api/projects             → Create project → trigger AI welcome
GET    /api/projects/:id         → Get project detail (with context summary)
PATCH  /api/projects/:id         → Update project metadata
DELETE /api/projects/:id         → Delete project
```

### Chats
```
GET    /api/projects/:id/chats   → List chats for a project
POST   /api/projects/:id/chats   → Create new chat thread
GET    /api/chats/:id/messages   → Get messages (paginated, ?cursor=&limit=)
POST   /api/chats/:id/messages   → Send message → AI responds → skills update
```

### Skills
```
GET    /api/skills               → Get all user skills (with validations)
POST   /api/skills/:id/verify    → Add verification to a skill
DELETE /api/skills/:id/verify/:vid → Remove a verification
```

### Portfolio
```
GET    /api/portfolio            → Aggregated portfolio data (skills, timeline, projects)
```

### Skill-Up
```
GET    /api/projects/:id/skillup → AI-generated recommendations (cached per session)
```

---

## Security Model

| Layer | Protection |
|-------|-----------|
| Transport | HTTPS everywhere (Vercel + Railway both enforce TLS) |
| Authentication | Supabase JWT verified on every BE request |
| Authorization | Service layer checks user_id ownership on every query |
| Input validation | Zod schemas on all request bodies/params before processing |
| Rate limiting | express-rate-limit: 30 AI calls/min/user, 100 general calls/min/user |
| Secret management | All API keys in BE env vars only, never in FE bundle |
| SQL injection | Supabase client uses parameterized queries (built-in) |
| XSS | Next.js auto-escapes, no dangerouslySetInnerHTML |
| CORS | Express CORS middleware — only allows frontend origin |

---

## Deployment

### Development
```bash
# Terminal 1: Frontend
cd client && npm run dev     # http://localhost:3000

# Terminal 2: Backend
cd server && npm run dev     # http://localhost:4000

# Supabase: cloud project (or local via supabase CLI)
```

### Production (Hackathon)
| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | skillforge.vercel.app |
| Backend | Railway (free tier) | skillforge-api.up.railway.app |
| Database | Supabase (free tier) | xxx.supabase.co |

### Self-Hosting (Phase 2, Docker)
```yaml
# docker-compose.yml (future)
services:
  client:
    build: ./client
    ports: ["3000:3000"]
  server:
    build: ./server
    ports: ["4000:4000"]
    environment:
      - SUPABASE_URL=...
      - OPENAI_API_KEY=...
  # Users bring their own Supabase instance (or we add local Postgres + pgvector)
```

---

## Technology Decisions

### Why Express over Next.js API Routes?

- **Separation of concerns:** FE and BE can be developed, tested, deployed independently
- **No vendor lock-in:** Express runs anywhere (Railway, Render, Fly, self-hosted Docker)
- **Proper middleware stack:** Rate limiting, CORS, validation, error handling — all cleaner in Express
- **Self-hosting story:** Much easier to Dockerize a standalone Express app
- **Scalability:** BE can scale independently of FE
- **Open-source clarity:** Contributors can understand the architecture immediately

### Why NOT tRPC/GraphQL?

- REST is simpler, faster to build for a hackathon
- Codex generates REST endpoints more reliably
- No schema sync complexity
- JSON REST with TypeScript types on both sides gives sufficient type safety

### Why Supabase over raw Postgres?

- Auth is free and production-grade (handles JWT, OAuth, magic links)
- pgvector extension available on free tier
- Storage for markdown files
- Managed — no ops during hackathon sprint
- Still standard Postgres — fully portable if we ever migrate

---

## Error Handling

### BE Error Response Format
```typescript
{
  "error": {
    "code": "VALIDATION_ERROR" | "AUTH_ERROR" | "NOT_FOUND" | "AI_ERROR" | "INTERNAL",
    "message": "Human-readable description",
    "details": {} // optional, field-level errors for validation
  }
}
```

### AI Error Strategy
1. First attempt: call GPT-5.6 Luna
2. If 429 (rate limited): wait 2s, retry once
3. If 500/502/timeout: retry once after 3s
4. If still failing: return friendly error to FE, log details server-side
5. Max 2 retries total (not 3 — fast failure is better UX than long waits)

### FE Error Display
- Toast notification for transient errors (network, AI timeout)
- Inline message for validation errors
- Full-screen error for auth failures (redirect to login)
