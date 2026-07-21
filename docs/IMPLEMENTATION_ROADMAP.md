# SkillForge - Current Implementation Roadmap

**Status:** active  
**Last updated:** 2026-07-22  
**Companion log:** [HACKATHON_BUILD_LOG.md](./HACKATHON_BUILD_LOG.md)  
**Product decisions:** [PRE_DEVELOPMENT_REFINEMENT.md](./PRE_DEVELOPMENT_REFINEMENT.md)  
**Assistant contract:** [AI_INTEGRATION.md](./AI_INTEGRATION.md)

## Purpose

This roadmap delivers a hackathon-sized, trustworthy SkillForge vertical slice. The visible product is a private-by-default, project-aware workspace for people creating a software product, business, marketing/growth system, or operational process. `Build` remains the internal/API/database term until a compatible migration is explicitly planned.

Its two connected outcomes are:

1. A dedicated Project **AI Assist** surface that helps a person make progress in the moment.
2. A visible **Skill Portfolio** that can infer unverified growth from the person’s own Project activity, then become proof-supported only when the person links relevant work or third-party proof.

This roadmap supersedes `TASKS.md` and any historical project/chat design where they conflict with the active Project, inference, evidence, and proof policy.

## Delivery principles

- Use **Project** in visible product terminology and a project’s own title where possible. Retain **Build** only in internal contracts, routes, migrations, and compatibility notes for now.
- Start the first-project flow with **“What have you built?”** rather than a skill declaration or quiz.
- Make **Skill Portfolio** the visible value: show project cards and portfolio context before users enter sharing decisions.
- Give every active Project a dedicated **AI Assist** surface; answer the user’s immediate question before exposing portfolio, inference, or evidence mechanics.
- Analyse eligible user-authored Project inputs automatically; retain exact provenance for every private skill-inference event.
- A private unverified estimate may update automatically. It is never silently published, independently verified, or shareable by itself.
- Treat privacy as an implicit default in ordinary UI copy. Preserve the technical privacy guarantees, capture controls, proof-status labels, and explicit sharing action; do not turn the absence of a “private” badge into a weaker boundary.
- Keep automatic inference, user-reviewable evidence, proof status, and public sharing as distinct concepts and data paths.
- Require explicit user selection and a public-safe snapshot before sharing any claim.
- Keep OpenAI, OpenRouter, Supabase server-secret/service-role access, and user data behind the Express backend.
- Make incomplete integrations visibly unavailable rather than simulating success.
- Record every meaningful decision, changed surface, validation result, model run, and blocker in the Build Week journal.

## Milestone 1 - Working foundation

**Status:** complete on 2026-07-19.

**Goal:** a runnable, credential-safe monorepo with a polished entry point and no simulated integrations.

Completed:

1. Created npm workspaces, split client/server configuration, local scripts, lockfile, builds, typechecks, and linting.
2. Added an Express application with validated configuration, security middleware, structured errors, and a public readiness endpoint.
3. Added the Next.js entry experience and shared SkillForge design system.
4. Added initial ordered migration source and Build Week documentation.

**Definition of done:** `npm run build` succeeds without real credentials, and `GET /health` reports readiness without exposing values.

## Milestone 2 - Secure data and identity boundary

**Status:** partially complete as of 2026-07-21. The fresh hosted Supabase project is connected, foundation migrations are deployed, and a local authenticated Build Brief path is live. Cross-tenant acceptance checks, artifact storage, profile persistence, and provider configuration remain.

**Goal:** establish BFF-only, owner-scoped access before more user data or model context exists.

Completed in source:

1. Replaced the legacy one-shot schema direction with ordered migrations and a BFF-only data-access posture.
2. Added JWKS/claim validation, typed request context, generic authorization failures, owner-scoped Build Brief routes, and optimistic revision checks.
3. Added an internally named Build Brief create/list path, presented to users as Projects, with server-only repository access.
4. Added Google/GitHub OAuth-ready browser sign-in with a fixed PKCE callback and no repository/proof scopes.

Remaining gate:

1. Run a two-account live isolation test for Build Brief list, read, create, and update; confirm non-owned records return the generic `404`.
2. Add private artifact-storage routes, server-generated keys, upload limits, and storage-authorization tests.
3. Add authenticated profile persistence.
4. Configure/test OAuth providers only after credentials are available, without expanding scopes.

**Definition of done:** a user can access only their own Build Briefs and artifacts through authenticated backend routes in a real Supabase environment, with authorization failures tested.

## Milestone 3 - Evidence and starting-estimate foundation

**Status:** MVP foundation complete as of 2026-07-22. The taxonomy/assessment-basis migrations, manual-evidence lifecycle, Brief-derived estimates, and project-level skill overview are live locally. Proof linking, editing, durable public claims, and a fuller provenance/recalculation experience remain deferred.

**Goal:** give every Build a private, source-aware record without implying a verified or public skill claim.

1. **Complete:** persist Build Briefs and controlled context-pack/capability vocabulary.
2. **In progress:** private manual evidence cards, source excerpts, lifecycle actions, role/contribution capture, and an evidence inbox.
3. **In progress:** retain clearly labelled Brief-derived `Beginner - Unverified` starting estimates separately from durable profiles.
4. **MVP complete:** project-level skill estimates and a user-facing Skill Portfolio distinguish the current estimate, assessment basis, proof state, and contributing projects. Detailed source-removal/recalculation and editing remain pending.
5. **Pending:** Proof Plan recommendations as evidence-building tasks, never guaranteed promotions.

Manual evidence remains user-reviewable. It is not the approval gate for the next milestone’s automatic private query inference; it is the reviewable/source-backed record used for an explainable Build Record and later sharing.

**Definition of done:** source-backed evidence is private, auditable, owner-scoped, and clearly distinguished from both automatic unverified inference and proof status.

## Milestone 4 - Project AI Assist and private skill inference

**Status:** MVP implementation complete as of 2026-07-22. Owner-scoped conversations, AI Assist, bounded context, conservative unverified inference, and a provider chain are implemented and tested. AI Assist attempts OpenAI first, then a configured OpenRouter open-weight provider, then the deterministic fallback. The server's OpenAI key is configured, but the first bounded direct-provider request returned `insufficient_quota`; one bounded synthetic provider-chain request through configured `openrouter/free` then succeeded. Availability and rate limits remain variable.

**Goal:** make SkillForge useful during active work through a dedicated AI Assist surface, while automatically deriving a private, explainable, unverified Skill Portfolio overview from the user’s own Project inputs.

**Presentation boundary:** the UI calls the active unit a **Project** and the work surface **AI Assist**. Existing `Build` routes, migrations, tables, and bounded-context contracts may remain unchanged behind that UI boundary until a deliberate compatibility migration is scoped.

1. **Complete:** owner-scoped Build conversations, idempotent messages, bounded recent context, and AI-run audit records through additive migrations.
2. **Complete:** a dedicated Project AI Assist surface and server-only provider chain: OpenAI -> OpenRouter open-weight provider -> deterministic fallback. Provider keys remain server-only.
3. **Complete (MVP):** bounded Brief, controlled capabilities, and recent conversation context. Cross-project memory and semantic caching remain deferred.
4. **Complete:** eligible user-authored input is persisted with source linkage and analysed through a bounded structured-output contract.
5. **Complete (MVP):** conservative server-owned policy persists only unverified estimates and never produces an automatic Advanced claim.
6. **Complete (MVP):** the conversation shows an observed-in-your-input rationale and the Skill Portfolio identifies basis/status. Full correction, source-removal, and recalculation controls remain pending.
7. **Complete (MVP):** one optional deeper-project prompt is separate from skill inference.
8. **Partial:** timeout, safe fallback, bounded payloads, model/prompt audit metadata, and tests are in place. The configured `openrouter/free` route passed one bounded synthetic test, but free availability/rate limits are variable and each chosen model/key should still be revalidated before a demo; cost caps, broader concurrency controls, and a production kill switch are deferred.

**Definition of done:** AI Assist answers a user’s Project question in context, an eligible user input can safely update a private unverified estimate with inspectable provenance, and no automatic inference is presented as proof-linked, verified, or public.

## Milestone 5 - Proof linking and selective sharing

**Status:** partially started for the MVP. The authenticated Skill Portfolio aggregates project-level estimates and evidence context; public share links, publication snapshots, and proof-link workflows remain planned.

**Goal:** let a user support selected skill claims with relevant work or third-party proof and share a limited public Skill Portfolio item safely.

1. Accept user-linked open-source repositories, public projects, public-safe closed-source role statements, blogs/write-ups/case studies, certifications, ranks, and test scores as proof sources.
2. Capture a capability/Build relevance statement and the user’s declared contribution or role.
3. Represent proof precisely as `Proof-linked`, `Source-validated`, or `Independently verified`; never upgrade the label merely because a URL exists.
4. Create redacted publication snapshots and opaque, expiring, revocable share links.
5. Serve public pages with generic inactive-link responses, `noindex` headers, and no embedded third-party content.
6. Remove revoked sources/items from active publications transactionally.

**Definition of done:** a Project can create and revoke an unlisted Skill Portfolio item that presents selected proof-labelled claims without exposing chats, internal notes, private inferences, raw identifiers, or unselected evidence.

## Milestone 6 - Evaluation, reliability, and demo readiness

**Status:** planned.

**Goal:** validate that the assistant is helpful, its inferences are fair and explainable, and the resulting record is safe to demo.

1. Evaluate context use, answer usefulness, inference relevance, provenance accuracy, false promotion resistance, optional-prompt relevance, copied/hypothetical claims, and cross-Build isolation across all four context packs.
2. Run a small builder study and record confirmation/correction, source-removal, proof-linking, and share-readiness outcomes.
3. Add durable retries, streaming/pending states, security/privacy regression tests, accessibility polish, deployment monitoring, deletion/export, and load checks.
4. Write an honest demo narrative based only on live, validated behavior.

**Definition of done:** the assistant and Build Record can be demonstrated with known limits, measured controls, and no misleading verification claim.

## Explicitly deferred

- Automated external URL fetching, repository import, arbitrary web scraping, or provider tokens.
- Source-validation/issuer integrations and independent-verification badges.
- A live hackathon/certification discovery catalog.
- Semantic answer caching, cross-Build memory, advanced team attribution, public discovery, and enterprise workflows.
- Any hiring score, opaque global score, or autonomous “verified skill” claim.

## Environment and credit gates

| Capability | Required configuration |
| --- | --- |
| Supabase Auth/data/storage | Project URL, client publishable key, server secret key (or explicit legacy service-role fallback), and JWT/JWKS configuration. |
| AI assistance | Preferred: server-only `OPENAI_API_KEY`. Optional fallback: server-only `OPENROUTER_API_KEY` and optional `OPENROUTER_MODEL`. The runtime order is OpenAI -> OpenRouter -> deterministic fallback; provider availability, quota, and free-tier rate limits must be validated separately. |
| Public deployment | Production origin, CORS allowlist, deployment secrets, and reviewed migration plan. |

Hackathon credits are reserved for measured assistant testing. Before the first live model-backed user turn, record the active provider/model, prompt/schema version, approximate request volume, cost-control setting, and rollback/kill-switch behavior in the Build Week journal. Do not treat one successful OpenRouter synthetic request as proof of stable free-model capacity or a rate limit.

## Documentation protocol

Before closing a milestone, update:

1. `HACKATHON_BUILD_LOG.md` - what changed, why, validation, and blockers.
2. This roadmap - status and sequencing changes.
3. `PRE_DEVELOPMENT_REFINEMENT.md` - only when a product decision changes.
4. Setup documentation - whenever a new command, environment variable, or deployment dependency is introduced.
