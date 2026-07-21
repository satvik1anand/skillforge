# SkillForge - Build-aware Assistant Integration Specification

**Status:** active design for the planned Build-aware Assistant slice; not implemented as of 2026-07-21.  
**Companion documents:** [Product specification](./PRODUCT_SPEC.md), [pre-development refinement](./PRE_DEVELOPMENT_REFINEMENT.md), and [current roadmap](./IMPLEMENTATION_ROADMAP.md).

## What this replaces

This document replaces the original project-companion draft that described `projects`, mandatory probing questions, automatically created chats, semantic answer caching, and direct model-written skill updates. Those ideas are historical and must not be treated as current implementation or data-model instructions.

The active design uses **Builds**, answers the user’s work question first, and separates three things that the original draft conflated:

1. Automatic, private **skill inference** from the user’s own Build inputs.
2. User-reviewable **evidence cards** for decisions, artifacts, experiments, and outcomes.
3. Later **proof linking/review** for a shareable claim.

## Product contract

The Build-aware assistant is a contextual work companion. It helps a user make progress on an active Build and privately infers skills from the reasoning demonstrated in their own queries, explanations, decisions, and results.

```text
User-authored Build input
        -> answer the work question
        -> analyse the user input for capability signals
        -> persist source provenance and a private inference event
        -> progression policy may raise an unverified skill estimate
        -> user can later link proof for a shareable, accurately labelled claim
```

The assistant must never present an automatic inference as a verified credential. It must not count an assistant message, an assistant-generated question, or a user’s copied-looking isolated prompt as sufficient support for a large level jump.

## Assistant behavior

### First priority: advance the active Build

For every message, the assistant:

1. Answers the user’s immediate question with the active Build’s goals, role, constraints, and previous decisions in mind.
2. Uses only the bounded context supplied by the server; it does not infer or retrieve another Build’s data.
3. Is direct, practical, and transparent about uncertainty. It does not interrupt the response with “I detected a skill.”
4. Offers an optional next step only when it is genuinely useful for the Build.

Build creation does not require an AI depth-probing exchange. A concise Build Brief is sufficient to start working. The assistant may ask a clarifying question when needed to give a correct answer, but that is not an assessment gate.

### Private skill inference from user queries

The assistant analyses **user-authored** Build messages. A question can reveal skill-relevant reasoning through, for example:

- Framing a problem and identifying assumptions.
- Stating constraints, risks, or success criteria.
- Comparing options and trade-offs.
- Planning execution, measurement, or iteration.
- Interpreting outcomes and adjusting a decision.

For each proposed inference, the model returns structured metadata rather than writing a skill profile directly. The backend verifies that every cited source belongs to the active user and Build, applies the current progression policy, and writes an auditable private event. When thresholds are met, the backend may automatically increment the private **unverified** estimate.

No evidence-card confirmation is required for that private inference. The user must still be able to inspect why it changed, correct or remove eligible source material, disable inference capture for a Build, and trigger a recalculation.

### Optional deeper prompt

An optional “Consider next” prompt may be returned after the answer. It is a context-aware suggestion that helps the user go deeper into the Build. It is not what the phrase “a question elicits insight” means: the skill signal comes from the user’s input, not from an assistant question.

Rules:

- Ground it in known Build facts and say why it matters now.
- Show at most one, make it skippable/dismissible, and rate-limit it.
- Never use the prompt itself as skill evidence or as a hidden test.
- A user’s later reply can be analysed like any other eligible user-authored message.

## Bounded context assembly

Every model invocation has an explicit token budget and a Build scope. The server assembles, in priority order:

1. **System and safety contract:** response rules, structured-output schema, privacy boundaries, and current versions.
2. **Build Brief:** outcome, role, primary/secondary context packs, audience, constraints, definition of done, metric, and timebox.
3. **Durable Build memory:** selected decisions, artifacts, milestones, facts, and unresolved work that have been intentionally retained.
4. **Skill/proof snapshot:** compact private estimates, proof statuses, relevant capability/practice definitions, and recent inference rationale.
5. **Conversation window:** recent messages from the active conversation plus a bounded recap for older context.
6. **The new user message.**

The assistant does not receive every historical chat or all user data by default. Cross-Build memory requires an explicit future user setting and must be clearly represented in the context manifest.

Memory is a structured, versioned fact ledger, not an indefinitely appended transcript. Durable update/compaction work runs through an idempotent outbox/worker path rather than an in-process background promise.

## Structured output contract

The provider returns a validated structured response. The exact Zod/JSON schema will be versioned in the server, but the first contract should be equivalent to:

```ts
type BuildAssistantResponse = {
  answer: string;
  contextDelta?: {
    facts: Array<{ kind: 'decision' | 'constraint' | 'milestone' | 'artifact' | 'metric'; summary: string }>;
  };
  skillInferences: Array<{
    capabilityId: string;
    practiceId?: string;
    proposedLevel: 'novice' | 'beginner' | 'intermediate' | 'advanced';
    confidence: number;
    rationale: string;
    sourceMessageIds: string[];
  }>;
  evidenceDrafts: Array<{
    claim: string;
    sourceMessageIds: string[];
    capabilityId?: string;
    practiceId?: string;
  }>;
  considerNext?: {
    prompt: string;
    whyNow: string;
    capabilityId?: string;
    practiceId?: string;
  };
};
```

The model can propose; it cannot write public records, mark proof as verified, change another Build, or create a level without source IDs. The server rejects malformed output, invalid capability/practice IDs, source IDs outside the user’s active Build, duplicate events, and unsupported progression transitions.

## Progression policy for private estimates

The policy is versioned, capability-specific, and explainable. It deliberately supports automatic unverified growth while limiting false inflation:

- A user’s query may generate a signal only when it is specific to the active Build and mapped to a controlled capability/practice.
- Signals are retained with exact source provenance, timestamp, model/prompt/schema versions, and progression-policy version.
- Repeated, coherent signals can raise an estimate automatically. Signals from distinct decisions, sessions, or kinds of reasoning carry more weight than a restatement of one idea.
- A single message must not make a large jump or establish an Advanced estimate by itself.
- Assistant messages, generic assistant-generated prompts, duplicated text, and irrelevant cross-Build context do not count as user signals.
- The user sees the current estimate as **Unverified** until relevant proof is linked and reviewed.
- Removing a source, disabling capture, or correcting the Build context triggers a transparent recalculation. Inactivity alone never lowers a level.

The existing manual-evidence rubric is a foundation, not the final message-inference policy. Implementers must add explicit, tested progression rules before enabling automatic updates.

## Evidence, proof, and sharing boundaries

Evidence cards remain a user-reviewable record. The assistant may draft one after a user message only if it can cite a concrete source; the user can confirm, edit, dismiss, or revoke it. Evidence-card acceptance is not required for the private-inference path, but it is required before an item can be selected for a Build Record.

The user later links proof appropriate to the claim, such as:

- An open-source repository or public implementation.
- A public project, or a closed-source project with a public-safe role and outcome statement.
- A blog, write-up, or case study explaining the work.
- A certification, relevant test result, benchmark rank, or score.

The UI distinguishes `Unverified estimate`, `Proof-linked`, `Source-validated`, and `Independently verified`. Linking a source does not by itself make the assistant’s inference independently verified. Public sharing is always an explicit selection of redacted, source-labelled snapshots.

## Persistence and operational workflow

For a chat turn:

1. Authenticate the request and confirm ownership of the active Build/conversation.
2. Persist the user message with a client-generated idempotency key.
3. Create an `ai_runs` record with a deterministic idempotency key, purpose, model/prompt/schema versions, and safe metadata. Do not persist raw prompts or raw model output in that audit table.
4. Assemble context, invoke the server-only provider, validate structured output, and save the assistant reply.
5. In one owner-scoped transaction, record accepted context deltas and private skill-inference events. Apply the versioned progression policy to any profile update.
6. Queue evidence drafting and memory compaction through durable jobs when they are not needed to answer the current request.

All tables and functions remain BFF-only. Browser clients send a JWT to the Express API but never receive a server secret, provider key, or direct application-table access.

## Provider selection and fallback

AI Assist uses a server-owned provider chain:

```text
OpenAI -> OpenRouter open-weight model -> deterministic fallback
```

1. If `OPENAI_API_KEY` is configured, the server attempts the preferred OpenAI provider first.
2. If that provider is unconfigured, unavailable, or cannot serve the request, the server may use OpenRouter only when `OPENROUTER_API_KEY` is configured. `OPENROUTER_MODEL` is optional and selects the open-weight fallback model when supplied; otherwise the server default applies.
3. If neither network provider can serve the request, the deterministic fallback keeps the Project conversation usable without silently pretending a model response was received.

OpenRouter is an optional resilience path, not a guarantee of free capacity. Free-model availability, selected-model availability, and rate limits are variable by account and time. The configured OpenRouter free route passed one bounded synthetic validation on 2026-07-22, but each chosen key/model should still be validated before a demo. `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, and any provider-specific configuration remain server-only and must never be logged or exposed to the browser.

## Safety, privacy, and cost controls

- Per-user and global request/token/cost caps, concurrency limits, budget alarm, and an operator kill switch are required before live model traffic.
- Capture and inference must respect an account/Build-level opt-out. Do not log raw chat, prompts, auth headers, or sensitive context in ordinary application logs.
- Treat user content and retrieved artifacts as untrusted. Limit size/tokens, separate instructions from data, and test prompt-injection scenarios.
- Validate all structured model output server-side. Schema validity is not evidence truth.
- Defer semantic answer caching in the first assistant slice; stateful Build context can make cached answers and side effects stale.
- Maintain a labelled evaluation set: correct context use, no cross-Build leakage, relevant answers, well-grounded inference, no unjustified promotion, optional-prompt relevance, provenance accuracy, and safe handling of copied/hypothetical claims.

## Delivery boundary

The first Build-aware Assistant slice delivers contextual chat, bounded memory, private query-derived inference events, explainability, and optional deeper prompts. It does not deliver automated external proof fetching, public sharing, source validation, independent verification, cross-Build memory, or semantic caching.

Implementation status and sequencing live in the [current roadmap](./IMPLEMENTATION_ROADMAP.md). The Build Week journal must record the first real model call, schema/prompt version, request volume, validation results, and cost-control settings before the assistant is represented as live.
