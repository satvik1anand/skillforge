# SkillForge — OpenAI Build Week Build Log

**Status:** active  
**Started:** 2026-07-19  
**Purpose:** a concise, durable account of the product decisions, implementation milestones, validation, and open risks from this collaborative build.

## Hackathon thesis

SkillForge is an AI-assisted workspace for outcome-driven builders. It helps someone building a software product, business, marketing system, or operational process preserve the decisions, artifacts, experiments, and results behind their work, then selectively turn that material into a shareable Skill Portfolio.

The hackathon hypothesis is that useful AI assistance can make real work easier *and* help a person retain credible, user-controlled evidence of how they worked. The product must distinguish a private, provenance-backed skill estimate from proof that has actually been linked, reviewed, or independently checked.

## Collaboration protocol

This log is maintained as we work together. It is a narrative and engineering record, not a replacement for the detailed product contract in [PRE_DEVELOPMENT_REFINEMENT.md](PRE_DEVELOPMENT_REFINEMENT.md).

- The product owner sets intent, scope, and policy decisions; the implementation partner turns them into designs, code, checks, and documented trade-offs.
- Each meaningful milestone records its scope, decisions, changed areas, validation performed, and unresolved risks.
- Planned work is labelled as planned or in progress. Completed work is recorded only after it is actually done and, where practical, checked.
- Product claims follow the same trust standard as the app: do not call a skill or proof verified unless the recorded process supports that label.
- Privacy, user control, and source provenance are first-class acceptance criteria, not polish to add later.

## Decision ledger

| Date | Decision | Why it matters | Status |
|---|---|---|---|
| 2026-07-19 | Serve outcome-driven builders across software, business, growth, and operations. | Broadens the audience without creating separate products; all use one evidence model. | Confirmed |
| 2026-07-19 | Make the core artifact a private-by-default, selectively shareable Build Record. | The record of decisions, artifacts, and outcomes is more valuable than a generic chat history. | Confirmed |
| 2026-07-19 | Use a shared Build Brief with lightweight context packs. | A single build can span product, venture, marketing, and operations work. | Confirmed |
| 2026-07-19 | Let AI draft private evidence cards; require user review before sharing. | Prevents silent public claims and keeps provenance reviewable. | Confirmed |
| 2026-07-21 | Display private, provenance-backed overview levels: Not yet assessed, Novice, Beginner, Intermediate, and Advanced. | Gives users a useful progress view without presenting it as a verified credential. | Confirmed |
| 2026-07-21 | Apply a server-side, versioned progression policy to owned Build inputs and retained sources. | The model can propose a signal, but cannot write a public claim, skip provenance, or independently mark it verified. | Confirmed |
| 2026-07-19 | Show proof status separately: Unverified estimate, Proof-linked, Source-validated, Independently verified. | A pasted public URL is meaningful evidence, but not automatic verification. | Confirmed |
| 2026-07-21 | Seed a private Brief-derived Beginner starting estimate from a user-authored Build Brief. | A concrete build description is a useful initial signal of basic proficiency, but not proof; it remains Unverified and cannot stand alone in a shareable portfolio record. | Confirmed |
| 2026-07-21 | Automatically analyse eligible user-authored Build queries, explanations, decisions, and results for private skill signals. | Restores the Build-aware assistant’s daily value while keeping updates unverified, exact-source-backed, explainable, and reversible. | Confirmed; implementation planned |
| 2026-07-19 | Include Proof Plan actions that help a user create stronger evidence. | Tests, tasks, and hackathon work can strengthen a record without being misrepresented as certification. | Confirmed |
| 2026-07-19 | Defer live opportunity discovery, provider integrations, semantic answer caching, and independent verification. | Keeps the MVP focused on a trustworthy vertical slice. | Confirmed |
| 2026-07-19 | Remove the unused Flutter setup and align with Next.js + Express + Supabase. | Eliminates an architecture conflict and reduces secret-handling risk. | Confirmed |
| 2026-07-19 | Prefer a BFF-only data-access model through Express. | Keeps service credentials and authorization decisions off the client. | Implemented in source; live validation pending |
| 2026-07-19 | Verify Supabase access tokens through asymmetric JWKS rather than a shared JWT secret. | Allows key rotation and avoids copying a signing secret into the application. | Implemented in source; live validation pending |
| 2026-07-19 | Treat unavailable storage or signing keys as explicit retryable service states. | Prevents a screen from simulating persistence or telling a valid user that their credentials are invalid during an outage. | Implemented in source |
| 2026-07-20 | Use current Supabase publishable/server-secret key names, retaining a guarded legacy service-role fallback. | Keeps new deployments aligned with Supabase's current key model without breaking an explicitly migrated older project. | Implemented in source; live validation pending |
| 2026-07-20 | Offer Google and GitHub only as opt-in identity sign-in for the MVP. | Reduces sign-in friction without treating account identity, repository access, or external links as proof. | Implemented in source; provider setup pending |
| 2026-07-22 | Use **Projects** in the visible product UI; retain **Build**/`Build Brief` only for internal, API, and database naming until a deliberate migration. | “Project” is clearer and more attractive for the broad kinds of work SkillForge supports, without creating avoidable technical churn. | Confirmed; UI refactor in progress |
| 2026-07-22 | Start the first-project flow with “What have you built?”, foreground a **Skill Portfolio**, and provide a dedicated **AI Assist** surface for each project. | The product should begin from real work, make the portfolio value visible, and keep assistance distinct from the consolidated project view. | Confirmed; UI refactor in progress |
| 2026-07-22 | Treat privacy as the default operating condition rather than a repeated visual label. | Repeated “private” copy distracts from the work; the interface should surface sharing and proof controls when the user is making that decision, while the technical privacy boundary stays unchanged. | Confirmed |
| 2026-07-22 | Add an optional OpenRouter open-weight fallback after OpenAI and before the deterministic AI Assist fallback. | Preserves a useful Project-assistance path when the preferred provider is unavailable or out of quota, without moving provider secrets to the browser. | Validated with one bounded synthetic request through configured `openrouter/free`; free availability and rate limits remain variable |

## Milestones

### M0 — Pre-development refinement

**Status:** complete on 2026-07-19

The initial concept was critically refined before code development. The resulting product contract is [PRE_DEVELOPMENT_REFINEMENT.md](PRE_DEVELOPMENT_REFINEMENT.md).

Key outcomes:

- Reframed the product from an opaque question-quality skill detector into an evidence-aware builder workspace; the later clarification preserves query-derived private inference without treating it as verification.
- Included business, marketing, and operations builders alongside software builders.
- Defined the evidence lifecycle, explainable skill overview, linked-proof vocabulary, Proof Plan, and safe sharing model.
- Set explicit trust boundaries: user approval before public sharing, no silent verification claims, and public-safe publication snapshots rather than raw private records.
- Identified foundation risks to address before shipping, including tenant isolation, JWT verification, provenance, durable AI workflows, and secret separation.

### M1 — Repository and security foundation

**Status:** complete on 2026-07-19

**Intent**  
Establish the smallest runnable, credential-safe foundation for the revised product contract. The foundation must not imply that authentication, data storage, AI assistance, or verification is already live.

**What changed**

- Created a root npm workspace, lockfile, shared build/typecheck scripts, and explicit client/server package boundaries.
- Added a static Next.js 14 entry experience for outcome-driven builders, with honest language around evidence-backed levels, proof-linked sources, and selected sharing.
- Added an Express 5 API foundation with Helmet, bounded JSON parsing, fail-closed CORS behavior, structured errors, graceful shutdown, and a public `/health` endpoint that exposes only readiness flags.
- Split client-safe and server-only environment templates. No service-role key or OpenAI key is exposed to the client.
- Added a migration-first Supabase foundation with normalized evidence, skill, proof, sharing, AI-run, and outbox records. All application tables have RLS enabled without browser policies in the BFF-only model.
- Marked the original one-shot database schema and task list as historical drafts, then added the current roadmap, database guide, root setup guide, and this ongoing Build Week journal.

**Decisions and trade-offs**

- The foundation intentionally has no live Supabase or OpenAI call. A configured status is visible only through non-sensitive readiness flags.
- The browser does not receive direct application-data access; the backend will own JWT verification and authorization before CRUD routes are added.
- The legacy schema is retained for comparison but is clearly marked as unsafe to run beside the migration. The migration is the new source of truth for a fresh database.

**Validation**

- `npm install --no-audit --no-fund` completed and created the workspace lockfile.
- `npm run typecheck` passed for both client and server.
- `npm run lint` passed with no ESLint warnings or errors.
- `npm run build` passed: Next.js produced the static route and the Express TypeScript build completed.
- A production server smoke test returned `200` from `GET /health`, with only safe not-configured readiness flags.
- A production client smoke test returned `200` and contained the expected SkillForge heading and product name.
- Static migration review found 23 application tables, 23 RLS enables, zero `CREATE POLICY` statements, and zero permissive `USING (true)` expressions.

**Risks, blockers, and next step**

- The migration has not been applied: this workspace has no configured Supabase project, local Supabase CLI, or PostgreSQL CLI.
- Supabase Auth/JWKS verification, storage, all authenticated CRUD, OpenAI assistance, deterministic skill calculation, proof linking, and public share routes remain deliberately unimplemented.
- The next milestone is the secure data and identity boundary: apply the fresh migration to a target project, add JWT verification, and build minimal authenticated Build Brief CRUD with cross-tenant tests.

### M2 — Secure Build Brief and assessment foundation

**Status:** partially complete in source as of 2026-07-19; live Supabase validation is pending

**Intent**  
Make the first private workspace record real in the product architecture before any model-generated evidence or public sharing is introduced. The app must never pretend it stored a record when storage is unavailable.

**What changed**

- Added a configuration-gated Supabase JWT boundary. The Express API validates signed access tokens against the configured Supabase JWKS, restricts accepted algorithms and claims, and exposes only a small verified request context to routes. The legacy shared-secret setting is rejected.
- Added authenticated, owner-scoped `GET`, `POST`, and optimistic-concurrency `PATCH` Build Brief routes. A request body never supplies the owner; every service-role query repeats the verified `user_id` filter, and missing/non-owned records use the same `404` response.
- Added a strict Build Brief contract for software/product, business/venture, marketing/growth, and operations/process work. It supports an intended outcome, role, audience, constraints, definition of done, optional metric/timebox, and an explicit private evidence-capture setting.
- Added the corresponding server-only Supabase repository. It is deliberately unavailable until both the project URL and service-role key are configured; the route returns a clear `503` instead of using memory or fabricated records.
- Added a private workspace creation form. It preserves form errors, adds a record to the client state only after a validated `201` response, and explains connection/session/configuration failures without inventing success.
- Added a pure deterministic skill-assessment service and tests. It distinguishes approved evidence from chat-only or duplicate claims, respects declared team roles, and keeps higher levels dependent on concrete work sources. It is not yet connected to a live evidence workflow or UI.
- Added a follow-up database migration with Build Brief field-length, metric-label, and numeric-value guards so future non-API write paths cannot silently drift from the API contract.
- Hardened deployment behavior: production rejects insecure frontend origins, and temporary JWKS-provider failures surface as a generic retryable authentication `503` rather than a false invalid-token response.

**Validation**

- `npm install --no-audit --no-fund` completed after the server Supabase dependency was added.
- `npm run typecheck`, `npm run lint`, and `npm run build` all passed.
- `npm test` passed with 15 tests, covering contract validation, authenticated request context, generic invalid-token responses, unavailable authentication/storage states, optimistic revisions, and the deterministic skill rubric gates.
- Production smoke checks returned `200` for `GET /health` with only not-configured readiness flags, and `200` for the built home and workspace routes. The home response includes the private-workspace call to action; the workspace response renders its safe loading state before authentication/configuration is available.
- Source review found no cross-tenant Build Brief path: ownership comes from verified authentication and is repeated in all service-role reads and writes. The migration has not been executed, so this is not a substitute for live database tests.

**Risks, blockers, and next step**

- No Supabase project, migration execution, real JWKS fetch, or real authenticated CRUD test exists in this workspace yet. The forms and routes are intentionally configuration-gated until that authority is supplied.
- The current UI creates and lists Build Briefs; an editor should define explicit `null` clear semantics for optional fields before it is added.
- Artifact storage, evidence-card lifecycle, proof linking, publication snapshots, and actual AI assistance remain future vertical slices. No OpenAI request has been made, so hackathon credits have not been consumed by the application.
- Next: connect a designated Supabase project, apply both migrations in order, and run live cross-tenant/JWKS/CRUD checks before using these routes in a demo. Then build the reviewed evidence-card workflow on top of a confirmed Build Brief.

### M2a — Hosted Supabase and OAuth readiness

**Status:** source and documentation complete on 2026-07-20; live project setup and integration validation pending

**Intent**  
Make deeper local testing possible without weakening the BFF boundary or overstating what an OAuth identity proves.

**What changed**

- Added a hosted-Supabase setup guide covering a fresh project, current key types, JWKS prerequisites, ordered migrations, exact redirect URLs, and a two-user live-test checklist.
- Made `SUPABASE_SECRET_KEY` the primary server-only configuration name. The legacy `SUPABASE_SERVICE_ROLE_KEY` remains a rejected-if-combined fallback for existing projects, and configuration tests cover both paths.
- Added configuration-gated Google and GitHub buttons, a fixed PKCE callback route, and the explicit code-for-session exchange. The callback is idempotent under React development Strict Mode and removes the one-time code from browser history before creating the auth client.
- Kept provider use identity-only: no repository scope, token import, proof creation, or verification claim is introduced.
- Marked outdated architecture and task instructions as historical so they cannot accidentally direct a new project to use the old shared JWT secret or legacy one-shot schema.

**Decisions and trade-offs**

- Google and GitHub are the initial convenience providers because they are widely available; other Supabase providers remain a later product choice, not a default scope expansion.
- The app uses a fixed `/auth/callback` rather than accepting a caller-supplied return URL, avoiding an open-redirect path.
- A hosted project, a provider dashboard, and real credentials are external account actions. None are claimed as complete until the product owner designates a test project and live checks succeed.

**Validation**

- `npm run typecheck` passed for client and server.
- `npm run lint` passed with no warnings or errors.
- `npm test` passed: 15 server tests, including modern and legacy server-key configuration behavior.
- `npm run build` passed; the production build includes `/auth/callback`.
- A production-style local smoke test returned `200` for the home page, `/auth/callback`, and `/health`. With no real project configured, health correctly reports Supabase and authentication as not configured.

**Risks, blockers, and next step**

- No Supabase project, migration execution, real JWT, database record, OAuth provider, or email confirmation flow has been tested yet.
- Next: the product owner creates or designates a fresh Supabase project, places credentials only in the local environment files, reviews the migration dry run, then enables selected identity providers and runs the live checklist.

### M2b — Live database connection and local integration readiness

**Status:** hosted connection and the first authenticated Build Brief path are complete on 2026-07-21; cross-tenant acceptance checks remain pending

**Intent**  
Move the first private-workspace path from configuration-gated source into a real, fresh Supabase test environment without treating infrastructure completion as proof that user flows have been exercised.

**What changed**

- Initialized the non-secret `supabase/config.toml` CLI configuration and aligned its local Auth URLs with SkillForge's `localhost` callback.
- Confirmed that the designated project is active and that its public JWKS exposes an ES256 signing key compatible with the Express verifier.
- Linked the local migration workspace to the designated fresh project. A dry run listed only `202607190001_initial_foundation.sql` and `202607190002_build_brief_constraints.sql`.
- Applied both reviewed migrations, then ran a second dry run that reported the remote database is up to date.
- Configured the local server with a server-only Supabase secret. The live API health endpoint reports both Supabase persistence and authentication as configured; a deliberately invalid signed-token shape now returns the expected `401` after remote JWKS access rather than an unavailable-auth `503`.
- Rebuilt and launched the local client against the hosted project. The `/signup` screen renders with Auth configured and the API health endpoint returns `200`.
- Exercised the signed-in local Build Brief path against the hosted project: a private Brief can be created, appears in the owner-scoped workspace list, and remains present after refresh.
- The first email-confirmation attempt indicated a likely local PKCE origin mismatch: the browser used `127.0.0.1` while the hosted Auth setup was centred on `localhost`. Added a dedicated `/signup/confirmation-pending` screen that explains the email step, same-browser/same-origin requirement, and a user-initiated resend action without placing an email address in the URL. An unconfirmed email/password sign-in now also links back to this recovery screen.
- Hardened `/auth/callback` to capture and scrub query and fragment credentials before browser-client initialization. It completes the expected PKCE code flow, retains safe support for implicit sessions, reserves direct token-hash handling for sign-up only, and now gives a specific recovery message when a browser-bound PKCE check cannot be completed.
- The hosted project's built-in mailer did not deliver the initial confirmation or a requested resend during local testing. With the product owner's explicit approval, temporarily disabled the hosted **Confirm email** requirement; the dashboard setting was saved and then verified after a reload.

**Decisions and trade-offs**

- The migration was applied only after the product owner confirmed the selected project was fresh and after the CLI dry run matched the two expected migration files.
- A CLI post-push message noted a missing local Docker Desktop dependency while caching a migration catalog. The migration itself succeeded and the remote follow-up dry run confirmed the deployment; local Docker is not required for the hosted integration path.
- Google and GitHub sign-in stay hidden until their dashboard providers and credentials are configured. Email/password is the first live-auth test path.
- `localhost` and `127.0.0.1` are distinct browser origins for PKCE cookies. The local live-auth checklist now uses `http://localhost:3000` consistently; confirmation URLs and their one-time values are neither recorded nor reused in project artifacts.
- Email confirmation is now a temporary test-environment bypass, not a product policy change. No user email should be represented as verified while this setting is off; configure custom SMTP and restore confirmation before a public or production-facing demo.

**Validation**

- Authenticated CLI project listing confirmed access to the active target before linking.
- `supabase db push --dry-run` listed exactly two expected migrations before deployment.
- `supabase db push` applied both migrations; the post-deployment dry run reported the remote database up to date.
- Local production-mode HTTP checks returned `200` for `/signup` and `/health`; health reports `supabase: configured` and `authentication: configured`.
- `npm run typecheck`, `npm run lint`, client production build, and `npm test` passed after the confirmation-flow change. A local browser check rendered the pending-confirmation instructions and the callback's no-credential recovery state; both local endpoints returned `200` after the rebuilt client was launched.
- The hosted **Confirm email** switch changed from checked to unchecked, its save action completed, and a dashboard reload showed it remained unchecked.
- A signed-in local test account created and refreshed a hosted Build Brief. Two-account isolation, artifact storage, and provider flows remain untested.

**Risks, blockers, and next step**

- The current hosted setup does not yet have Google/GitHub provider credentials configured, so OAuth buttons remain intentionally absent.
- The temporary bypass means an email/password account can be created without mailbox proof. Do not treat email ownership as verified and restore confirmation after custom SMTP is configured.
- Next: repeat Build Brief list/read/create/update with a second account and confirm non-owned records return the generic `404`. Then deploy and live-test the manual evidence migration below.

### M3 — Evidence and skill-estimate vertical slice

**Status:** in progress as of 2026-07-21; the initial manual-evidence migration is deployed and its create/confirm/revoke lifecycle is live-tested

**Intent**  
Give each private Build Brief a concrete place to work, retain source-backed evidence, and review that evidence without silently turning it into a verified or public skill claim.

**What changed**

- Added an additive migration that seeds the controlled capability/context-practice vocabulary used by the four builder contexts, records a future skill-estimate basis, and adds individual/team contribution capture to evidence cards.
- Added transactional, service-role-only database functions for manual evidence creation and lifecycle transitions. One call creates the card, its required private source excerpt, and an append-only event together.
- Added a focused follow-up migration after live testing exposed an ambiguous output-column reference inside the first RPC definition. The corrected functions now qualify all table `id` references.
- Added owner-scoped API routes for listing, creating, reading, confirming, dismissing, and revoking private evidence cards under a Build Brief. The API injects the verified user ID, applies generic missing/non-owned responses, and never accepts a browser-selected database status or origin.
- Added a per-build workspace reachable from each build card. It shows the Brief, clearly-labelled Brief-derived starting estimates, an evidence inbox, individual/team contribution controls, source excerpt capture, and explicit lifecycle actions.
- Kept the manual workflow intentionally narrow: a saved or confirmed card neither changes a skill level nor becomes public, proof-linked, or independently verified.

**Decisions and trade-offs**

- A user-authored source excerpt is the first accepted manual source. Repository URLs, certificates, ranks, case studies, automated URL fetching, and sharing remain later proof-linking work.
- Team evidence requires a role statement in both API validation and database constraints to avoid inflating an individual claim from collective work.
- The UI calls confirmation "for your private record," rather than verification. Confirmation means the user stands behind the retained evidence; it is not third-party validation.

**Validation**

- `npm run typecheck` passed for client and server.
- `npm run lint` passed with no client warnings or errors.
- `npm run build:server` and `npm run build:client` passed; the build includes the dynamic `/workspace/builds/[id]` route.
- `npm test` passed with 19 server tests. New coverage verifies strict owner injection, team-role validation, generic non-owned build responses, and safe lifecycle-transition conflicts.
- A reviewed `supabase db push --dry-run` deployed `202607210003_manual_evidence_foundation.sql`. A live database diagnostic found the RPC ambiguity, a second dry run/deployment applied `202607210004_fix_manual_evidence_rpc.sql`, and the final dry run reported the remote database up to date.
- In the authenticated browser workspace, a clearly-labelled private acceptance record was created as suggested, confirmed without changing any displayed skill estimate, revoked, and still displayed as revoked after a page reload.

**Risks, blockers, and next step**

- The first slice does not yet edit evidence, link it to a capability, assess a profile, explain a level, link external proof, or share a record.
- A revoked, clearly-labelled acceptance record remains in the private test build as an audit trail; it is not a user skill claim and cannot affect an estimate or sharing surface.
- Next: add evidence editing and capability links, then run two-account owner-isolation checks before allowing any assessment or sharing work.

### M4 - Build-aware Assistant policy and implementation plan

**Status:** planned as of 2026-07-21; documentation decision recorded, no assistant code or model call is claimed

**Intent**  
Restore the Build-aware assistant as the daily work surface while keeping its automatic skill growth useful, explainable, and honest about verification.

**What changed**

- Clarified the product policy across the active roadmap, refinement contract, product specification, and AI integration specification.
- Defined automatic analysis of eligible **user-authored** Build questions, queries, explanations, decisions, and results. The system may increment a private, unverified skill estimate without requiring an evidence-card confirmation.
- Required exact source provenance, versioned model/schema/progression metadata, owner/Build scope checks, a private “Why this estimate?” view, correction/removal/recalculation controls, and Build-level capture opt-out.
- Kept evidence-card review, proof linking, and public sharing separate: user-reviewed evidence supports the Build Record; linked repository/public project/blog/case study/certification/rank/test proof supports a precisely labelled later claim.
- Classified optional assistant-generated deeper prompts as a separate, skippable aid. They are not the user input being analysed and never count as a skill signal by themselves.

**Decisions and trade-offs**

- An unverified estimate can evolve from a user’s real work style; it must never be presented as proof-linked, source-validated, independently verified, or public by default.
- Repeated, coherent, capability-specific signals can cause an automatic increase. One polished, copied-looking, assistant-authored, or out-of-context message cannot cause a substantial jump.
- The existing manual-evidence flow remains valuable but is not an approval gate for the private-inference path. It remains required for selected public Build Record material.

**Validation**

- Documentation-only consistency review completed: at this point the active terminology was Build; the roadmap prioritised the assistant ahead of proof linking/sharing; automatic private inference and later proof status were distinct. The 2026-07-22 Project-first presentation decision supersedes the visible-language portion of this note.
- No OpenAI provider, chat UI, message storage, automatic inference, proof linking, or public sharing has been implemented or live-tested by this policy update.

**Risks, blockers, and next step**

- The current deterministic assessment service and active migrations do not yet implement user-query-derived progression. Additive message/memory/inference migrations, server policy tests, bounded context, structured output validation, cost caps, and an evaluation set are required before enabling it.
- The server must receive a configured server-only OpenAI key and model/cost limits before the first live assistant request. Record that first call and its controls here.
- Next: implement the owner-scoped Build conversation and private inference vertical slice described in the active roadmap.

### M4a — Project-first workspace and Skill Portfolio presentation

**Status:** product decision confirmed on 2026-07-22; UI implementation and visual QA are in progress

**Intent**  
Make the workspace feel like a modern project environment rather than a collection of records, while keeping the evidence, inference, and sharing boundaries intact.

**What changed**

- The visible product noun is now **Project**. The initial creation prompt is **“What have you built?”**; after that answer, the interface refers to the work by its title or as a project.
- The workspace foregrounds **Skill Portfolio** as the user-facing outcome. It uses project cards and a portfolio summary rather than leading with record counts or privacy badges.
- An active project has a consolidated project view and a dedicated **AI Assist** surface. AI Assist is where the user works through project questions; it is not framed as a generic chatbot.
- “Private record,” “private evidence,” and similar repeated labels are removed from ordinary UI copy. This is a presentation change, not a relaxation of any privacy requirement.

**Decisions and trade-offs**

- Existing server routes, database tables, contracts, migrations, and internal context names may continue to use `Build` and `Build Brief`. They are implementation vocabulary until a separately planned, compatible migration proves worthwhile.
- Privacy remains default-on at the data and authorization layers. The UI still makes sharing an explicit user action and continues to show proof/verification status where it affects a claim.
- The portfolio is a visible work-in-progress view, not a promise that an inferred skill is verified or ready to publish.

**Validation**

- Product-owner feedback established the new terminology, portfolio emphasis, card interaction, and dedicated-assistant direction.
- Implementation checks and authenticated visual QA are recorded with the corresponding UI changes; this entry records the decision, not an untested public-sharing claim.

**Risks, blockers, and next step**

- Avoid leaking internal `Build` terminology back into user-facing copy while the API continues to use it.
- Keep exact source provenance, owner scope, BFF-only access, capture controls, redaction, and explicit sharing flows unchanged during the UI refactor.
- Next: complete the project workspace layout and AI Assist surface, then test keyboard navigation, responsive behavior, and the transition between project context and Skill Portfolio.

### M4b — MVP integrated portfolio and reliable AI Assist fallback

**Date:** 2026-07-22  
**Status:** complete for the local MVP  
**Owner(s):** product owner / implementation partner

**Intent**  
Make the primary demo loop complete without overstating proof or public-sharing capabilities.

**What changed**

- Added an authenticated `/portfolio` view that aggregates the existing owner-scoped Project skill-overview responses. It shows contributing Projects, current level, assessment basis, and proof state.
- Linked the workspace Skill Portfolio navigation and rail CTA to that view.
- Strengthened the deterministic AI Assist fallback so a no-key local run still gives Project-aware next steps and only conservative, user-input-grounded unverified signals.
- Added provider/fallback coverage for bounded structured Responses input, generic-input non-inference, and graceful provider failure.
- Rewrote the README with the live MVP scope, setup, migration sequence, and a 90-second demo flow.

**Validation**

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed; the server suite contains 29 passing tests and the production client includes `/portfolio`.
- Authenticated browser QA confirmed the workspace-to-portfolio transition, nine aggregated skill estimates for the existing Project, contributing-Project links, no console errors, and no horizontal overflow at the local narrow viewport.
- The local client and API health endpoints both returned `200` after restart.

**Risks, blockers, and next step**

- `OPENAI_API_KEY` is configured and the key/model availability check succeeds, but a bounded synthetic Responses request returned `429 insufficient_quota` on 2026-07-22. The provider chain therefore continues to the configured fallback.
- An `OPENROUTER_API_KEY` was then configured. A bounded synthetic provider-chain request returned a live response through `openrouter/free` after the OpenAI fallback, without sending user project, chat, or evidence data. Free-router availability and rate limits remain variable.
- The portfolio is authenticated and in-product only. Public share links, proof linking, and independent verification are intentionally not claimed in this MVP.

### Later milestone — Reliability, evaluation, and demo readiness

**Status:** planned

Target work: durable AI job handling, rubric and prompt evaluation, privacy/security regression checks, accessibility and usability polish, deployment checks, and a demo narrative based on real product behavior.

## Validation and blocker log

| Date | Area | Current record | Follow-up |
|---|---|---|---|
| 2026-07-19 | Product safety | Product trust boundaries and evidence/proof terminology have been specified in the refinement contract. | Encode them in schemas, API authorization, UI copy, and tests. |
| 2026-07-19 | OpenAI access | Hackathon credits are available according to the product owner. No application API call or key validation is claimed in this log. | Configure the API key only on the server and add cost limits before enabling model-backed work. |
| 2026-07-19 | Supabase and auth | The source now has a JWKS verifier, server-only owner-scoped Build Brief repository, authenticated routes, and a browser Auth/workspace path. No deployed database, real JWT, storage, or RLS validation is claimed. | Apply the migrations to a designated project and test live cross-tenant access before launch or demo. |
| 2026-07-19 | M2 validation | Typecheck, lint, production builds, API health, and production client HTTP checks passed; 15 server tests cover the current contracts, auth states, routes, and rubric gates. | Add real Supabase/JWKS integration tests and evidence lifecycle tests. |
| 2026-07-19 | Database execution | Two ordered fresh-database migrations and a migration guide now exist, but no Supabase/PostgreSQL CLI or target project is available in this workspace. | Apply and test both only against a designated fresh project; do not combine them with the legacy schema. |
| 2026-07-19 | Version control and delivery | A reproducible npm lockfile and migration source now exist. The workspace does not currently present as an initialized Git repository. | Initialize/attach the intended repository and add CI when the project owner chooses the remote/delivery workflow. |
| 2026-07-20 | Hosted Supabase and OAuth | The source now supports current public/server key names, a fixed PKCE callback, and opt-in Google/GitHub buttons. No cloud project or provider credential has been connected. | Designate a fresh test project, apply migrations only after a reviewed dry run, then run real identity, persistence, cross-tenant, and provider-cancellation checks. |
| 2026-07-21 | Hosted-project preflight | A client project URL and publishable key are configured locally; the Supabase CLI config was initialized, and the public JWKS returned one ES256 key. No server secret, project link, migration, or cloud data write is claimed. | Add the server-only secret locally, confirm the target is a fresh test project, then link and review the migration dry run. |
| 2026-07-21 | Live migration deployment | The fresh project was linked after an authenticated access check. The dry run listed exactly the two foundation migrations; both were applied and a follow-up dry run confirmed the remote database is up to date. | Complete real account, Build Brief persistence, and two-account isolation tests before presenting the path as end-to-end verified. |
| 2026-07-21 | Email confirmation UX | The first live confirmation indicated that local PKCE state is origin-bound. A pending-confirmation screen, resend action, unconfirmed-sign-in recovery path, and resilient callback parsing are now implemented and locally checked; no one-time confirmation value was retained. | Run a fresh signup entirely at `http://localhost:3000`, then continue the persistence and isolation acceptance checks. |
| 2026-07-21 | Temporary Auth testing policy | Hosted built-in email delivery did not arrive after an initial confirmation and resend request. With explicit approval, **Confirm email** was disabled in the fresh test project and verified by a dashboard reload. | Test immediate sign-up/session and Build Brief persistence now; configure custom SMTP and restore confirmation before any public-facing use. |
| 2026-07-21 | Hosted Build Brief path | A signed-in local test account created a hosted Build Brief, saw it in the owner-scoped workspace, and refreshed it successfully. | Run the same list/read/create/update checks with a second account and confirm generic non-owned responses. |
| 2026-07-21 | Build workspace language | Removed the competing top-level record count. Build cards now show **Skill estimates** as controlled, Brief-derived `Beginner · Unverified` starting estimates, using a context-pack fallback and clear terms in the brief title/outcome. | Keep manual evidence separate from these estimates until the M4 private query-inference policy is implemented and tested. |
| 2026-07-21 | M3 manual evidence source | Deployed the controlled taxonomy and manual-evidence migrations, including a focused RPC ambiguity fix. A signed-in browser created, confirmed, revoked, and reloaded one labelled private acceptance record; the visible Brief-derived estimates did not change. | Add editing/capability links and two-account isolation checks before any assessment or sharing work. |
| 2026-07-21 | Build-aware Assistant policy | Active product documentation now defines automatic private, provenance-backed skill inference from user-authored Build inputs, separate optional deeper prompts, and later proof linking/review. No assistant implementation or model call is claimed. | Implement owner-scoped conversations, bounded context, progression-policy tests, and cost controls before enabling inference. |
| 2026-07-22 | MVP demo handoff | The root README now gives a one-command local start after environment setup, current migration guidance, an honest 90-second Project → AI Assist → unverified signals → evidence → Skill Portfolio demo path, OpenAI-key prerequisites, and verification commands. It explicitly does not claim public sharing or verification workflows. | Keep the README aligned with the live Supabase/OpenAI configuration and judge-demo validation as those environments change. |

## Reusable log-entry template

### M[Number] — [Milestone or change]

**Date:** YYYY-MM-DD  
**Status:** planned / in progress / complete / blocked  
**Owner(s):** product owner / implementation partner / both

**Intent**  
What user or product outcome this work is meant to achieve.

**What changed**

- Files, interfaces, behavior, or decisions that changed.
- Keep factual; do not describe planned work as complete.

**Decisions and trade-offs**

- Decision and reason.
- Deferred alternative, if relevant.

**Validation**

- Command, manual check, evaluation case, or user feedback.
- Actual result, including failures or untested areas.

**Risks, blockers, and next step**

- Remaining uncertainty, required credentials/authority, or safety concern.
- The smallest concrete next action.

---

## Narrative guardrail for demos and submissions

When describing SkillForge publicly, show the inference, evidence, and proof boundaries honestly: AI may derive a private unverified estimate from traceable user-authored Build inputs, and it may help draft a source-backed claim. The user controls evidence acceptance and sharing; a proof link is labelled according to the level of validation actually performed. The demo must never imply that the system independently certified a person merely because it observed their questions or a linked URL.
