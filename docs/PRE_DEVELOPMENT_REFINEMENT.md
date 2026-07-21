# SkillForge - Pre-Development Refinement

**Status:** active product decision record  
**Last updated:** 2026-07-21  
**Recommendation:** conditional go - build a private, Build-aware workspace with automatic unverified skill inference and later proof-supported sharing. Do not claim that inferred questions alone verify a person's skills.

## Executive decision

The product should include a useful skill overview that can change automatically from a user's own Build-related inputs. A query, explanation, decision, or result can reveal useful reasoning signals while someone works. Those signals may increment a **private, unverified** level when a calibrated, provenance-backed progression policy is met.

That is intentionally different from verification. A repository, public project, blog/write-up, certification, rank, or test score can later support the user’s claim, but the product must label the precise proof status it has actually established. The underlying asset remains the decisions, artifacts, experiments, outcomes, and reasoning that normally disappear while someone builds something real.

The refined product promise is:

> **SkillForge helps people building a product, business, growth system, or operational process move real work forward and turn it into a shareable, source-backed record of what they did, decided, and achieved.**

That retains the Education-track value while serving builders beyond software. It also makes the portfolio useful to a job seeker, client, accelerator, manager, or collaborator without claiming independent verification too early.

## Product model: outcome-driven builders

### Initial audience and job

**Initial customer profile**

Individual builders and very small teams who are accountable for a concrete outcome:

- Developers and technical founders building a product.
- Founders validating an offer, customer problem, or business model.
- Growth and marketing builders improving a funnel or campaign.
- Operations builders improving a workflow, service level, or internal process.

They may use the record for a portfolio, job search, accelerator application, client pitch, internal career narrative, or retrospective.

**Job to be done**

> While I create a real outcome, help me make progress and retain evidence I can confidently show later.

Use **build** in product language. A project is an implementation detail; an "exploration" is too unconstrained for credible evidence claims.

### One product, four lightweight context packs

Every build has one shared **Build Brief**:

- Outcome and definition of done.
- Audience, customer, or stakeholder.
- Baseline and target measure where applicable.
- Scope, timebox, constraints, and the user's role.
- Linked artifacts, milestones, decisions, and next action.
- Evidence-capture and sharing preferences.

The user chooses a primary context pack and may add secondary workstreams. A startup launch can therefore combine software, business, growth, and operations without creating four separate products.

| Context pack | Helpful intake and evidence examples |
|---|---|
| Software product | User problem, stack, release goal, and technical constraints; repository, design document, test plan, PR, deployment, or incident review. |
| Business / venture | Customer segment, problem, offer, validation stage, and pricing or revenue hypothesis; interview notes, landing page, pitch, LOI, or revenue snapshot. |
| Marketing / growth | Audience, funnel stage, channel, hypothesis, and target metric; campaign brief, creative, landing page, dashboard, or experiment review. |
| Operations / process | Process owner, workflow, bottleneck, service level, and risk; process map, SOP, automation, service dashboard, or retrospective. |

Context packs change the brief template, examples, assistant guidance, and proof suggestions. They must not create separate databases, assessment systems, or product experiences.

### Positioning

- **Primary:** "A Build-aware workspace that helps you move work forward and keep a record of what it shows."
- **Supporting:** "Build work worth showing. Keep the evidence."
- **Avoid:** "silently proves your skills," "verified from your questions," "objective skill score," and "AI assessment."

The Build-aware assistant is the daily work surface; the Build Record is the durable portfolio outcome. They are complementary, not competing products.

### Refined core loop

```text
Set a build outcome
        |
Work with contextual AI on a real problem
        |
User-authored queries and decisions create private skill signals
        |
Private, unverified estimate may update with exact provenance
        |
Capture/review decisions, artifacts, experiments, and results
        |
Link relevant proof and select public-safe Build Record items
```

## Evidence, not opaque proficiency scores

### Evidence cards

Every claim must be traceable to a concrete source. The AI may draft a card, but it cannot silently publish a claim or call it verified.

An evidence card contains:

- A stable capability and, where relevant, a context-pack practice.
- A narrow behavioral claim, for example: "Designed and compared two onboarding variants to test activation friction, then selected the lower-friction flow based on completion data."
- Source type: user explanation, decision, artifact, task result, repository/PR, deployment, metric, self-attestation, or external credential.
- Exact source reference: message and excerpt, decision ID, artifact link, content hash, metric snapshot, or credential URL.
- Build, chat, user-role, and timestamp context.
- Prompt, model, schema, and rubric version used to draft it.
- Lifecycle state and user visibility controls.

### Shared capabilities and domain practices

Use a stable capability model instead of a model-invented skills list.

**Transferable capabilities** shared by every builder:

1. Problem framing and outcome definition
2. Research and validation
3. Planning and prioritisation
4. Solution, system, or process design
5. Execution and delivery
6. Experimentation and measurement
7. Decision-making and iteration
8. Quality, risk, and reliability
9. Communication and documentation

Each context pack adds a small practice vocabulary beneath these capabilities. For example, `experiment design` is transferable; `funnel conversion experiment` is a growth practice, while `load-test design` is a software practice.

### Evidence lifecycle

These labels describe the evidence record, not the user's permanent proficiency.

| Status | Meaning | Shareable? |
|---|---|---|
| Suggested | AI found a possible source-backed claim; the user has not reviewed it. | No |
| Confirmed | The user accepted or edited the claim. | Yes, if selected |
| Linked | A tangible artifact or external record is attached. | Yes, if selected |
| Outcome-supported | A result, metric, evaluator feedback, or public outcome supports the claim. | Yes, if selected |
| Revoked | The user removed or withdrew support for the claim. | No |

Rename **Add verification** to **Add evidence**. A user-entered URL is linked evidence, not independent verification; external proof affects the separate proof status described below.

### Private overview levels and automatic inference

Every capability can have an overview level: **Not yet assessed**, **Novice**, **Beginner**, **Intermediate**, or **Advanced**. A user-authored Build Brief may seed a private **Brief-derived Beginner** starting estimate when its stated work maps to a controlled capability. It is a self-attested starting signal, not proof or a shareable credential.

As a person works, SkillForge analyses eligible **user-authored** Build queries, explanations, decisions, and outcomes. It may automatically increment a private, unverified estimate when the server’s versioned progression policy finds coherent capability-specific signals. This path does not require the user to first confirm an evidence card.

| Level | Private inference expectation | Shareable on its own? |
|---|---|---|
| Brief-derived Beginner | A user-authored Build Brief maps to a controlled capability. | No - private and unverified. |
| Novice | An early Build-specific input shows concept exploration or a first guided attempt. | No - private and unverified. |
| Beginner | One or more Build-specific inputs show bounded use of established guidance, a decision, or an explained task. | No - private and unverified. |
| Intermediate | Repeated, coherent Build inputs show execution plus reasoning, measurement, iteration, or a trade-off in the same capability/practice. | No - private and unverified until relevant proof is linked/reviewed. |
| Advanced | Repeated Build inputs across meaningful scope show design/trade-off reasoning, delivery, outcomes or sustained iteration, and potentially leadership. It cannot be assigned from one message, one copied-looking prompt, or a Build description. | No - private and unverified until relevant proof is linked/reviewed. |

The progression policy must be capability-specific, versioned, and explainable. For example, `Social media marketing` can distinguish audience/hypothesis reasoning, campaign execution, and result analysis; `API design` can distinguish constraints, design choices, implementation, and testing/operational thinking. The UI must show **why this estimate**: the exact user-source references, inference rationale, current policy version, and last update. Users can correct the source context, remove a source, disable capture for a Build, and request recalculation; they cannot manually choose a higher level.

Protect against false inflation by deduplicating near-identical inputs, limiting how much one conversation can count, requiring repeated/coherent signals before a substantial increase, and excluding assistant messages and assistant-generated prompts from user-signal analysis. A single URL does not promote a level. For team outcomes, record the user’s declared role and contribution rather than crediting every collaborator with the whole result. The model may propose a signal, but the server validates its source ownership/scope and applies the deterministic progression policy. Do not automatically downgrade a skill for inactivity; re-assess only when the user requests it or an eligible source is removed or revoked.

### Proof status for a skill level

The overview level and proof status are separate axes:

| Proof status | Meaning | Availability |
|---|---|---|
| Unverified estimate | A Brief-derived, user-query-inferred, or evidence-informed private level has no linked proof. It is private and not shareable on its own. | MVP |
| Proof-linked | The user attached a relevant public repository, certification, ranking, public project/case study, or other visible source and asserted their connection to it. | MVP |
| Source-validated | SkillForge checked the source and, where possible, its ownership or platform identity; this does not prove broad competence. | Later controlled workflow |
| Independently verified | A trusted issuer, platform, qualified reviewer, or formal assessment authenticated the relevant claim. | Later integration |

In the share view, show a compact combination such as **Social media marketing - Intermediate - Proof-linked (2 sources)**. Do not include a Brief-only starting estimate in a shareable record. This gives the user the desired visible distinction between unverified levels and levels with public proof, while reserving the bare word **Verified** for a source that the product actually validated.

### Supported proof types

| User-provided proof | MVP label | What it supports | Later validation |
|---|---|---|---|
| Public GitHub/GitLab repository | Public repository linked | A relevant codebase exists and the user claims a contribution. | Connected account, collaborator status, commits/PRs, or rubric review. |
| Public blog, write-up, or case study | Public write-up linked | The user documented a scoped decision, process, result, or contribution. | Ownership/author confirmation or reviewer assessment of the stated scope. |
| Certificate | Credential linked | The user attached a claimed credential. | Issuer lookup, credential ID, expiry, or issuer signature. |
| HackerRank or similar ranking | Assessment result linked | The user attached a claimed score/rank for a named assessment and date. | Public profile connection or official result confirmation. |
| Closed-source build with public visibility | Public outcome linked | A public product, case study, launch, client-facing result, or role statement is visible. | Employer/client attestation, verified organization domain, or optional expert review. |

For closed-source work, require a public-safe role statement such as "I owned the campaign experiment design and reporting" plus an explicit confirmation that the user is allowed to share it. The proof supports the scoped role and visible outcome; it must not imply that the user authored the entire private project or expose confidential material.

### Automatic inference versus user-reviewed evidence

Automatic private inference and user-reviewed evidence have different jobs.

When an eligible user message reveals useful Build-specific reasoning, the assistant can record a private inference event and the progression policy may update the private overview level immediately. The event links to the exact user message and records its rationale, capability/practice, model/schema version, and policy version. It does **not** require an Evidence Inbox confirmation, and it must never become public or be represented as verified.

After a meaningful interaction, the AI can also quietly create a private evidence-card draft such as:

> "Ran an acquisition experiment: defined a landing-page hypothesis, compared two variants, and reviewed completion data."

The card links to the exact decision, result, or artifact that supports it. In a non-disruptive Evidence Inbox, the user can **confirm, edit, dismiss, hide, or revoke** it. Only confirmed cards selected by the user can appear on a public share page.

For a low-friction experience, the system may auto-save private **suggested** cards and private inference events. It must never auto-share either, and it must always let the user turn evidence/inference capture off for a Build or chat.

## Proof Plan: help users build evidence

Add a **Proof Plan** instead of generic "Skill Up" scores. It recommends a concrete action that will produce better evidence for the active build.

| Context pack | Example proof-building action |
|---|---|
| Software product | Write a test matrix, compare two designs, run and document a load test, or publish a retrospective. |
| Business / venture | Conduct structured customer interviews, test an offer, compare pricing options, or document validation findings. |
| Marketing / growth | Define a hypothesis, run a bounded campaign, analyze a funnel result, or document an experiment decision. |
| Operations / process | Map a baseline workflow, trial an SOP or automation, measure time/error reduction, or run a process retrospective. |

Completing a task creates potential evidence; it does not itself verify proficiency. A hackathon submission, certificate, repository, deployed build, or public result can be attached as **linked third-party evidence**.

Offer this as a **Strengthen this evidence** action on a private card. Each recommendation should state the target capability, why the action would strengthen the record, expected output, completion criteria, estimated effort, and a place to attach the result. A user may self-attest completion, but the resulting label is `task output linked`, never `passed` or `verified`.

For the MVP, do not build a live hackathon or certification marketplace. Allow users to add an opportunity URL and offer only curated, date-checked opportunities once there is a maintained catalog. The model must not invent live-event URLs, deadlines, or certificates.

## Experience design

### First use

1. Ask: "What are you trying to build?"
2. Select a context pack, desired outcome, role, and only the fields needed for a useful Build Brief.
3. Accept optional context such as a README, interview notes, campaign brief, process document, or artifact link.
4. Immediately provide a concise brief and one useful next action. A clarifying question is optional, not an assessment gate.
5. Explain evidence capture and sharing in plain language: private by default, reviewable, and reversible.

Do not collect onboarding data only for future tailoring. Use it now, make it optional, or omit it.

### Workspace

Keep the calm three-panel layout, but make the right panel a **Build Record**:

- **Build Brief:** outcome, milestone, constraints, role, linked artifacts, and metrics.
- **Build-aware assistant:** the main work surface; it answers the user’s active Build question using bounded Build context.
- **Evidence Inbox:** suggested cards ready to review.
- **Decisions and results:** accepted evidence, artifacts, and outcomes.
- **Skills overview:** private inferred Novice/Beginner/Intermediate/Advanced levels, a distinct proof status, and an explainable source history.
- **Proof Plan:** one context-aware action that improves the work or its evidence.

The assistant answers the immediate question first. It analyses the user’s input silently for private skill signals, may prepare an evidence candidate when there is a concrete source, and may offer one optional, rate-limited deeper prompt. The deeper prompt is separate from inference; it is not a test and does not count as a user signal by itself.

### Shareable Build Record

Sharing belongs in the MVP, but it must be selected and private by default.

The share-page flow is:

1. The user chooses the build, selected confirmed cards, artifacts, and a short narrative.
2. The app shows a preview and flags raw excerpts, private information, and unreviewed claims.
3. The user redacts or removes anything sensitive, then creates an unlisted share link.
4. The user can expire, revoke, rotate, or delete the link at any time.

The public page shows the user's role, build outcome, selected evidence, source labels, and linked proof. It must never expose raw chat history, hidden cards, internal notes, or underlying database identifiers by default. Each public item uses a dedicated public-safe summary and publication snapshot, not a live copy of a private message.

An unlisted link is a discoverability control, not confidentiality: a recipient can forward or screenshot it. Use an opaque high-entropy URL, default expiry, generic 404s for missing/revoked/expired pages, `noindex`/`noarchive`, no public comments, and no automatic fetching or embedding of third-party content. Clearly state that linked evidence is not independently verified.

## MVP scope and guardrails

### Build now

1. One shared Build Brief and evidence model with four lightweight context packs.
2. Private builds for solo builders and small-team contributors who can state their role.
3. Contextual Build-aware AI help and automatic private, query-derived skill estimates with a transparent "why this estimate" view.
4. A non-disruptive Evidence Inbox with confirm/edit/dismiss/revoke controls for source-backed Build Record items.
5. Manual public-proof linking and a Proof Plan with context-specific tasks; proof status remains distinct from the inferred estimate.
6. Selected, revocable, private-by-default share links with redaction and provenance labels.
7. Seeded demo data visibly marked as synthetic/demo evidence.

### Defer

- Employer grading, hiring scores, opaque global scoring, or automated competency certification.
- Independent verification badges and provider integrations.
- Full GitHub, CRM, analytics, advertising, or workflow-system integrations.
- Live external opportunity discovery, hackathon directories, and certification marketplaces.
- Team attribution disputes, enterprise compliance workflows, and regulated-domain advice.
- Public-by-default portfolios, semantic answer caching, and advanced mobile work.

The scope principle is: **breadth in who can build, narrowness in the shared mechanics.**

## Trust, privacy, and sharing requirements

Builders may contribute proprietary strategy, customer data, marketing results, or internal processes. Privacy is therefore a product requirement.

- Make evidence and private-inference capture opt-in and reversible at account, Build, and chat level.
- Show what is stored, what is sent to the AI provider, and why.
- Show the exact source and rationale for a private estimate; never display an inference as public proof or independent verification.
- Make public sharing an explicit export of selected, confirmed material; never a view over the private record.
- Provide preview, redaction, expiry, revocation, link rotation, deletion, and export from the first public-sharing release. Revoking a source or card must remove it from every active public record transactionally.
- Build deletion must remove database records, derived summaries, inference events, cache entries, and linked storage objects.
- Do not log raw chats, uploaded files, authorization headers, or sensitive context in application logs.
- Treat uploads and user messages as untrusted data, not instructions. Apply strict type, size, token, and content limits and use server-generated storage keys.
- Validate user- and model-provided URLs before rendering them. Use HTTPS allowlists where appropriate.
- Do not automatically fetch arbitrary proof URLs in the MVP. Later source checks need strict allowlists, egress controls, redirect limits, and private-network blocking to prevent SSRF and privacy leaks.
- Only a dedicated proof-check workflow may set `source-validated` or `independently-verified`; a client request must never be able to set those states.
- Moderate public-facing text, red-team prompt injection and fake-expertise cases, and make model refusals manageable in the UI.

Current OpenAI guidance recommends moderation, adversarial testing, constrained inputs/outputs, and human review where model output has practical consequences. See [Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices).

## Technical decisions before implementation

### Runtime and repository hygiene

Next.js + Express + Supabase remains viable. Keep controller -> service -> model separation and make the backend security boundary real.

The stale Flutter configuration has been removed:

- Deleted `pubspec.yaml`, which conflicted with the agreed Next.js/Express architecture and listed `.env` as a client asset.
- Replaced Flutter-oriented ignore rules with Node/Next.js build output and secret-file protections.

Still required before application code:

- Split environment templates into `client/.env.example` and `server/.env.example`.
- Never put service-role or OpenAI keys in a client directory.
- Establish a Git repository, Node package manager/lockfile, Supabase CLI migrations, and CI.

### Access control and authentication

Pick one documented data-access model:

1. **Recommended BFF-only model:** Express is the only application data client. Revoke application-table and RPC privileges from `anon` and `authenticated`; keep no permissive RLS policies; use server credentials only in the backend.
2. **Direct Supabase model:** expose selected operations deliberately and create `TO authenticated` ownership policies for every table, relation, and storage object.

Do not use both accidentally. The current `FOR ALL USING (true) WITH CHECK (true)` policies provide no tenant isolation and must not ship. Current Supabase guidance describes RLS as a row-level policy boundary and recommends role-specific policies. See [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Verify Supabase user tokens with a vetted JWT verifier and the project's JWKS, or a supported claims-verification method. Validate issuer, audience, expiration, subject, and allowed algorithm; never simply decode a token. See [Supabase JWT guidance](https://supabase.com/docs/guides/auth/jwts).

### Data model and lineage

Replace the aggregate-only skill design with normalized, auditable records:

```text
capabilities            stable transferable capability taxonomy
context_practices       context-pack-specific practices
builds                  Build Brief, role, context packs, and privacy settings
build_conversations     owner-scoped Build conversation metadata
build_messages          user/assistant messages with idempotency and source provenance
build_memory_items      bounded, versioned Build facts and conversation recaps
build_artifacts         linked or uploaded evidence sources
evidence_cards          source-backed claims, review lifecycle, and public-safe wording
evidence_sources        card-to-message, decision, artifact, metric, or credential provenance
evidence_skill_links    card-to-capability contribution, rubric dimensions, role, and deduplication key
evidence_events         append-only activity timeline
skill_inference_events  private user-input signal, exact message sources, rationale, and progression version
skill_profiles          per-user private capability estimate, proof status, policy version, and last calculation
skill_assessments       explainable immutable private-estimate decisions and their sources
proof_plan_items        recommended task/opportunity, rationale, criteria, and status
proof_submissions       self-attested completion and linked output for a proof-plan item
external_proofs         public repository, certification, rank, case-study, or outcome metadata
proof_skill_links       proof-to-skill/evidence relevance and user-declared role
proof_checks            user attestation, URL check, ownership validation, or issuer/platform result
share_pages             revocable public record metadata and publication state
share_page_items        selected, redacted publication snapshots of evidence/artifacts
share_links             opaque link identifier, expiry, rotation, and revocation metadata
verification_attempts   reserved future issuer/platform/human verification workflow
ai_runs                 idempotent provider run, prompt/model/schema/progression metadata
outbox_jobs             durable derivations such as inference, evidence drafting, or compaction
```

Public sharing must read only `share_page_items` through a server route or narrowly scoped security-definer function. It must not expose the private `builds`, messages, or evidence tables through a permissive RLS policy.

Also correct the existing schema before it runs:

- The `skills` trigger sets `NEW.updated_at`, but the table has `last_updated`; updates will fail.
- `source_projects UUID[]` cannot enforce ownership or provenance; use relational tables.
- Ensure chats, messages, validations, artifacts, evidence, and share-page items cannot refer to another user's build.
- Protect cache RPCs from untrusted execution if they remain in the database.
- Use versioned Supabase CLI migrations and migration tests rather than a one-shot SQL Editor script.

### Durable AI workflow and context

Persist a user message with a client-generated idempotency key and durable `ai_run` state before invoking the model. Persist an assistant reply under a deterministic terminal status, validate structured model output, then record any private user-query inference event with exact source IDs and apply the versioned progression policy transactionally. Use a durable outbox/worker for evidence drafting and compaction. Do not rely on in-process background promises.

Keep two bounded, versioned memory records:

- **Build Brief:** stable outcome, constraints, decisions, artifacts, and metrics.
- **Chat memory:** a per-chat recap and unresolved thread-specific work.

Build prompts to an actual token budget. Replace a structured fact ledger rather than appending summaries indefinitely, and atomically claim compaction work so two workers cannot summarize the same messages. Do not include other Builds by default; cross-Build memory requires an explicit future consent setting.

### Model, evaluation, and cost

GPT-5.6 Luna is a valid cost-sensitive choice: it currently supports structured outputs and is priced at $1 input / $6 output per million tokens. See the [GPT-5.6 Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna). Keep model choice in a provider/router configuration, not scattered through the codebase.

- Prefer one current API surface for new structured and streaming work, validate structured output server-side with Zod, and version every prompt, schema, rubric, and model choice.
- Strict JSON Schema guarantees shape, not truth. An evidence-card draft and a skill-inference proposal must contain owned source IDs and pass server policy validation.
- Evaluate both Build answers and automatic private-inference proposals before relying on them; use a stronger model only where a measured quality improvement justifies the cost.
- Hackathon credits make a prototype feasible, but add per-user daily token/cost caps, global concurrency limits, a provider budget alarm, and a kill switch.

Defer semantic answer caching. Stateful builds need answers that reflect current context, evidence, and goals; replaying side effects can create false evidence. Native prompt caching is only helpful for exact repeated prefixes, so measure it instead of assuming a semantic-cache hit rate. See [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## Validation plan

Run a concierge or clickable-prototype study with 5-8 builders spanning the four context packs.

Questions to answer:

1. Does the user get immediate help that advances their build?
2. Does the private estimate change only when the user recognises the cited Build input as a fair signal of their reasoning?
3. Can they identify a decision, artifact, experiment, or result worth preserving?
4. Is the drafted evidence accurate, fairly scoped, and easy to review?
5. Would they confidently share the selected proof-labelled record with an interviewer, client, mentor, manager, or accelerator?
6. Does the Proof Plan lead to a meaningful next action?

Build a labeled evaluation set before enabling automatic private inference or evidence suggestions. Include genuine work, copied or hypothetical expertise, vague messages, prompt injection in uploads, contradictory claims, sensitive data, cross-Build contamination attempts, and cases where the correct output is no inference and no evidence card.

Track:

- **Activation:** useful help plus one understandable private estimate or confirmed evidence item.
- **Inference quality:** justified progression rate, incorrect-promotion rate, source-removal/recalculation rate, and appeal/correction rate by policy/model version.
- **Trust:** confirmation rate without material edits and dismissal rate for evidence cards by rubric/model version.
- **Share readiness:** users who intentionally create a share page after reviewing it.
- **Harm:** unsupported claims, false provenance, accidental exposure, and misleading maturity language.
- **North star:** confirmed, source-backed evidence records tied to meaningful build outcomes.

## Revised delivery sequence

### Phase 0 - product contract

1. Approve the outcome-driven-builder positioning and four context packs.
2. Approve the evidence lifecycle, public-share policy, and verification vocabulary.
3. Define the capability taxonomy, context practices, and proof-plan templates.
4. Decide the BFF-only or direct-Supabase authorization boundary.
5. Allocate hackathon credits and define cost guardrails.

### Phase 1 - foundation and risk removal

1. Establish Node/Next.js + Express tooling, environment separation, Git, migrations, and CI.
2. Implement JWT verification, grants/RLS, storage ownership, cross-tenant tests, and a safe public-share route.
3. Implement Build Brief, artifacts, evidence cards, share pages, idempotent AI runs, and redacted observability.

### Phase 2 - validate the vertical slice

1. Ship one contextual build workspace, selected context packs, and immediate AI help.
2. Add automatic private, user-query-derived skill inference with exact provenance and a versioned progression policy; keep suggested evidence and proof linking distinct.
3. Add Proof Plan tasks, manual proof linking, and revocable share links after the private-inference path is explainable.
4. Run usability studies and the evaluation set; refine answer, inference, and proof policies before increasing automation.

### Phase 3 - reliability and polish

1. Add durable outbox/worker processing, streaming/pending states, bounded context, and retries.
2. Add timelines, deletion/export, accessibility, security regression tests, load checks, and deployment monitoring.

### Phase 4 - earned expansion

1. Add provider integrations for linked evidence and independently verified claims.
2. Add a curated, date-checked opportunity catalog for hackathons and challenges if it proves useful.
3. Revisit semantic caching, advanced multi-chat behavior, teams, and public discovery behind feature flags and quality gates.

## Confirmed decisions and remaining choice

| Decision | Current direction |
|---|---|
| Audience | Outcome-driven builders across software, business, growth, and operations. |
| Core artifact | A source-backed Build Record that users can selectively share. |
| Skill levels | A Build Brief can seed a private Brief-derived Beginner starting estimate; user-authored Build inputs can automatically refine private unverified Novice/Beginner/Intermediate/Advanced estimates with exact provenance and a versioned progression policy. |
| Proof status | Unverified estimate -> Proof-linked -> Source-validated -> Independently verified. |
| Proof building | Context-specific tasks/tests now; curated hackathon recommendations later. |
| Flutter | Removed as unused and unsafe for the selected architecture. |
| Assessment policy | Seed private Brief-derived Beginner starting estimates; automatically infer private unverified growth from eligible user-authored Build inputs; retain source provenance and explainability; require linked/reviewed proof before a portfolio claim is share-ready. |
| Data access | Recommended: BFF-only Supabase access through Express. |
| Semantic cache | Defer. |

## Go / no-go

**Go now:** a shareable, evidence-aware builder workspace that is private by default, user-controlled, and precise about what is evidence versus what is independently verified.

**No-go:** public claims that silently "prove" or "verify" someone's professional capability from question quality alone.
